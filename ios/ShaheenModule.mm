#import "ShaheenModule.h"
#import <React/RCTUtils.h>

extern "C" {
    char* rust_mwa_generate_association();
    char* rust_mwa_authorize(const char* cluster);
    char* rust_mwa_sign_transactions(const char* cluster, const char* tx_hex, const char* auth_token);
    void rust_free_string(char* s);
}

@implementation ShaheenModule

RCT_EXPORT_MODULE(ShaheenModule)

// Ensure module initialized on main thread or has custom queue
+ (BOOL)requiresMainQueueSetup {
    return YES;
}


RCT_EXPORT_METHOD(generateAssociationUri:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        @try {
            char* nativeRes = rust_mwa_generate_association();
            NSString *resStr = [NSString stringWithUTF8String:nativeRes];
            rust_free_string(nativeRes);
            
            NSData *data = [resStr dataUsingEncoding:NSUTF8StringEncoding];
            NSError *error = nil;
            NSDictionary *jsonDict = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
            
            if (error || !jsonDict) {
                resolve(@{
                    @"uri": @"",
                    @"port": @0
                });
            } else {
                resolve(jsonDict);
            }
        } @catch (NSException *exception) {
            reject(@"iOS_exception", exception.reason, nil);
        }
    });
}

RCT_EXPORT_METHOD(connectAndAuthorize:(NSString *)cluster
                  port:(nonnull NSNumber *)port
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        @try {
            char* nativeRes = rust_mwa_authorize(
                [cluster UTF8String] ?: ""
            );
            
            NSString *resStr = [NSString stringWithUTF8String:nativeRes];
            rust_free_string(nativeRes);
            
            NSData *data = [resStr dataUsingEncoding:NSUTF8StringEncoding];
            NSError *error = nil;
            NSDictionary *jsonDict = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
            
            if (error || !jsonDict) {
                resolve(@{
                    @"success": @NO,
                    @"publicKey": @"",
                    @"authToken": @"",
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

RCT_EXPORT_METHOD(connectAndSign:(NSString *)cluster
                  port:(nonnull NSNumber *)port
                  txHex:(NSString *)txHex
                  authToken:(NSString *)authToken
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        @try {
            char* nativeRes = rust_mwa_sign_transactions(
                [cluster UTF8String] ?: "",
                [txHex UTF8String] ?: "",
                [authToken UTF8String] ?: ""
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
                    @"signedTxHex": @"",
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
