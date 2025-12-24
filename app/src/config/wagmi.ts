import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Homora Vault',
  projectId: 'REPLACE_WITH_WALLETCONNECT_PROJECT_ID',
  chains: [sepolia],
  ssr: false,
});
