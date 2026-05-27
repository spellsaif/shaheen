import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface ShaheenInstruction {
  programId: string;
  keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  dataHex: string;
}

export interface ShaheenExecutionResult {
  success: boolean;
  signature: string;
  error: string;
}

export interface Spec extends TurboModule {
  connectAndExecute(
    cluster: string,
    instruction: ShaheenInstruction
  ): Promise<ShaheenExecutionResult>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ShaheenModule');
