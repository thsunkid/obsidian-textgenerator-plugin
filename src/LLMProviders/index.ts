import CustomProvider from "./custom/custom";
import AnthropicCustomProvider from "./custom/anthropic";

import LangchainOpenAIChatProvider from "./langchain/openaiChat";
import LangchainMistralAIChatProvider from "./langchain/mistralaiChat";
import LangchainOpenAIInstructProvider from "./langchain/openaiInstruct";
import LangchainHFProvider from "./langchain/hf";
import ChatanthropicLangchainProvider from "./langchain/chatanthropic";
import OllamaLangchainProvider from "./langchain/ollama";
import LangchainAzureOpenAIChatProvider from "./langchain/azureOpenAIChat";
import LangchainAzureOpenAIInstructProvider from "./langchain/azureOpenAIInstruct";
import LangchainPalmProvider from "./langchain/palm";
import LangchainChatGoogleGenerativeAIProvider from "./langchain/googleGenerativeAI";
import ProxyAnthropicProvider from "./custom/proxyAnthropic";
// import LangchainReplicaProvider from "./langchain/replica"

// import { LOCClone1, LOCClone2 } from "./langchain/clones";

export const defaultProviders = [
  // openai
  LangchainOpenAIChatProvider,
  LangchainOpenAIInstructProvider,

  // google
  LangchainChatGoogleGenerativeAIProvider,
  LangchainPalmProvider,

  // ollama
  OllamaLangchainProvider,

  // huggingface
  LangchainHFProvider,

  // mistralAI
  LangchainMistralAIChatProvider,

  // anthropic
  ChatanthropicLangchainProvider,

  // azure
  LangchainAzureOpenAIChatProvider,
  LangchainAzureOpenAIInstructProvider,

  // replica (disabled because it doesn't work)
  // "Replica (Langchain)": LangchainReplicaProvider,

  // anthropic custom
  AnthropicCustomProvider,

  // LOCClone1,
  // LOCClone2,

  // custom
  CustomProvider,
  ProxyAnthropicProvider,
];

export type llmType = (typeof defaultProviders)[number]["id"];
export type llmSlugType = (typeof defaultProviders)[number]["slug"];
export type LLMProviderType = llmType;

export const defaultProvidersMap: Record<
  any,
  (typeof defaultProviders)[number]
> = {} as any;

for (const llm of defaultProviders) {
  defaultProvidersMap[llm.id] = llm;
}
