#import "ShaheenModule.h"
#import "../cpp/ShaheenJSI.h"
#import <React/RCTBridge+Private.h>
#import <React/RCTUtils.h>

extern "C" {
    char* rust_mwa_execute(const char* cluster, const char* prog_id, const char* data_hex, const char* keys_json);
    void rust_free_string(char* s);
}

@implementation ShaheenModule

RCT_EXPORT_MODULE(ShaheenModule)

// Ensure module initialized on main thread or has custom queue
+ (BOOL)requiresMainQueueSetup {
    return YES;
}

- (void)setBridge:(RCTBridge *)bridge {
    [super setBridge:bridge];
    
    // Install JSI bindings when bridge is available
    RCTCxxBridge *cxxBridge = (RCTCxxBridge *)bridge;
    if (cxxBridge.runtime) {
        facebook::jsi::Runtime *rt = (facebook::jsi::Runtime *)cxxBridge.runtime;
        [self installJSIBindings:*rt];
    }
}

- (void)installJSIBindings:(facebook::jsi::Runtime &)rt {
    auto executeMwa = facebook::jsi::Function::createFromHostFunction(
        rt,
        facebook::jsi::PropNameID::forAscii(rt, "shaheenExecuteSync"),
        2,
        [](facebook::jsi::Runtime &rt, const facebook::jsi::Value &thisVal, const facebook::jsi::Value *args, size_t count) -> facebook::jsi::Value {
            if (count < 2) {
                return facebook::jsi::Value(false);
            }
            return facebook::react::ShaheenJSI::executeMwaNative(rt, args[0], args[1]);
        }
    );
    rt.global().setProperty(rt, "shaheenExecuteSync", std::move(executeMwa));
}

RCT_EXPORT_METHOD(connectAndExecute:(NSString *)cluster
                  instruction:(NSDictionary *)instruction
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    // Run MWA network operations asynchronously on global background queue to avoid blocking JS/UI thread
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        @try {
            NSString *programId = instruction[@"programId"];
            NSString *dataHex = instruction[@"dataHex"];
            NSArray *keysArray = instruction[@"keys"];
            
            if (!programId || !dataHex || !keysArray) {
                resolve(@{
                    @"success": @NO,
                    @"signature": @"",
                    @"error": @"Invalid instruction fields passed"
                });
                return;
            }
            
            NSMutableString *keysJson = [NSMutableString stringWithString:@"["];
            for (NSUInteger i = 0; i < keysArray.count; i++) {
                NSDictionary *keyObj = keysArray[i];
                NSString *pubkey = keyObj[@"pubkey"];
                BOOL isSigner = [keyObj[@"isSigner"] boolValue];
                BOOL isWritable = [keyObj[@"isWritable"] boolValue];
                
                [keysJson appendFormat:@"{\"pubkey\":\"%@\",\"isSigner\":%@,\"isWritable\":%@}",
                            pubkey ?: @"",
                            isSigner ? @"true" : @"false",
                            isWritable ? @"true" : @"false"];
                if (i < keysArray.count - 1) {
                    [keysJson appendString:@","];
                }
            }
            [keysJson appendString:@"]"];
            
            char* nativeRes = rust_mwa_execute(
                [cluster UTF8String] ?: "",
                [programId UTF8String] ?: "",
                [dataHex UTF8String] ?: "",
                [keysJson UTF8String] ?: "[]"
            );
            
            NSString *resStr = [NSString stringWithUTF8String:nativeRes];
            rust_free_string(nativeRes);
            
            NSData *data = [resStr dataUsingEncoding:NSUTF8StringEncoding];
            NSError *error = nil;
            NSDictionary *jsonDict = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
            
            if (error || !jsonDict) {
                resolve(@{
                    @"success": @NO,
                    @"signature": @"",
                    @"error": @"Failed to parse Rust response string"
                });
            } else {
                resolve(jsonDict);
            }
        } @catch (NSException *exception) {
            reject(@"iOS_exception", exception.reason, nil);
        }
    });
}

@end
