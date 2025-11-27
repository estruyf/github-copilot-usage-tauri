import { invoke } from "@tauri-apps/api/core";

export interface AuthFlowState {
  user_code: string;
  verification_uri: string;
  device_code: string;
  interval: number;
}

export async function startAuthFlow(): Promise<AuthFlowState> {
  return await invoke<AuthFlowState>("start_auth_flow");
}

export async function completeAuthFlow(device_code: string): Promise<string> {
  return await invoke<string>("complete_auth_flow", {
    deviceCode: device_code,
  });
}

export async function closeAuthServer(): Promise<void> {
  return await invoke<void>("close_auth_server");
}
