import React from "react";
import safeAwait from "safe-await";
import { Message } from "src/types";
import TextGeneratorPlugin from "src/main";
import type { ContextTemplate } from "./refs";
import LLMProviderInterface, { LLMConfig } from "./interface";
import { processPromisesSetteledBatch, promiseForceFullfil } from "#/utils";
import { AI_MODELS } from "#/constants";

export default class ProviderBase implements LLMProviderInterface {
  id = "default";
  static slug = "default";
  provider = "default";
  static displayName = "default";
  cloned?: boolean | undefined;
  originalId = "";
  plugin: TextGeneratorPlugin;
  config: any;

  corsBypass = false;

  constructor(props: { plugin: TextGeneratorPlugin; config?: any }) {
    this.plugin = props.plugin;
    this.config = props.config;
  }

  streamable?: boolean | undefined;
  mobileSupport?: boolean | undefined;

  async load() {}

  async generate(
    messages: Message[],
    reqParams: Partial<Omit<LLMConfig, "n">>,
    onToken?: (
      token: string,
      first: boolean
    ) => Promise<string | void | null | undefined>,
    customConfig?: any
  ): Promise<string> {
    return "";
  }

  async generateMultiple(
    messages: Message[],
    reqParams: Partial<LLMConfig>
  ): Promise<string[]> {
    return [];
  }

  cleanConfig<T>(options: T): T {
    const cleanedOptions: any = {}; // Create a new object to store the cleaned properties

    for (const key in options) {
      if (Object.prototype.hasOwnProperty.call(options, key)) {
        const value = options[key];

        // Check if the value is not an empty string
        if (
          (typeof value != "undefined" && typeof value !== "string") ||
          value !== ""
        ) {
          cleanedOptions[key] = value; // Copy non-empty properties to the cleaned object
        }
      }
    }

    return cleanedOptions;
  }

  async generateBatch(
    batches: { messages: Message[]; reqParams: Partial<LLMConfig> }[],
    customConfig?: any,
    onOneFinishs?: ((content: string, index: number) => void) | undefined
  ): Promise<string[]> {
    const k = await processPromisesSetteledBatch(
      batches.map(async (batch, i) => {
        const [err, res] = await safeAwait(
          this.generate(
            batch.messages,
            batch.reqParams,
            undefined,
            customConfig
          )
        );

        const content = err ? "fAILED:" + err.message : res;

        await onOneFinishs?.(content, i);

        if (err) throw err;

        return content;
      }),
      customConfig.nParallelRequests || 3
    );

    return k.map(promiseForceFullfil);
  }

  RenderSettings(props: Parameters<LLMProviderInterface["RenderSettings"]>[0]) {
    return <></>;
  }

  getSettings() {
    return this.plugin.settings.LLMProviderOptions[this.id] as Record<
      string,
      any
    >;
  }

  calcTokens(
    messages: Message[],
    reqParams: Partial<LLMConfig>
  ): ReturnType<LLMProviderInterface["calcTokens"]> {
    throw new Error("calcTokens Method not implemented." + this.id);
  }

  calcPrice(tokens: number, reqParams: Partial<LLMConfig>): Promise<number> {
    throw new Error("calcPrice Method not implemented." + this.id);
  }

  // @ts-ignore
  getModels() {
    const models: any[] = Array.from(Object.entries(AI_MODELS))
      .filter((k) =>
        k[1].llm.includes(
          this.plugin.textGenerator.LLMProvider?.originalId as any
        )
      )
      .map((k) => {
        // @ts-ignore
        k[1].id = k[0];
        return k[1];
      });

    return models;
  }

  makeMessage(content: any, role: "system" | "user" | "assistant"): Message {
    return {
      role,
      content,
    };
  }
}
