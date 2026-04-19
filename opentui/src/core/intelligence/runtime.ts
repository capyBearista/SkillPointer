import { IntelligenceProvider } from "./provider-interface.js";

let activeProvider: IntelligenceProvider | null = null;

export function getIntelligenceProvider(): IntelligenceProvider | null {
  return activeProvider;
}

export function setIntelligenceProvider(provider: IntelligenceProvider) {
  activeProvider = provider;
}
