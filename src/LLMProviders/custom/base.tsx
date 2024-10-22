import React from "react";
import debug from "debug";
import JSON5 from "json5";
import get from "lodash.get";
import LLMProviderInterface, { LLMConfig } from "../interface";
import { Handlebars } from "../../helpers/handlebars-helpers";
import BaseProvider from "../base";
import { AsyncReturnType, cleanConfig } from "../utils";
import { requestWithoutCORS, requestWithoutCORSParam, Message } from "../refs";
import { Platform } from "obsidian";
import runJSInSandbox from "#/helpers/javascript-sandbox";

const logger = debug("textgenerator:CustomProvider");

export const default_values = {
  endpoint: "https://api.openai.com/v1/chat/completions",
  custom_header: `{
    "Content-Type": "application/json",
    authorization: "Bearer {{api_key}}"
}`,
  custom_body: `{
    model: "{{model}}",
    temperature: {{temperature}},
    top_p: {{top_p}},
    frequency_penalty: {{frequency_penalty}},
    presence_penalty: {{presence_penalty}},
    max_tokens: {{max_tokens}},
    n: {{n}},
    stream: {{stream}},
    stop: "{{stop}}",
    messages: {{stringify messages}}
}`,
  // frequency_penalty: 0,
  model: "gpt-3.5-turbo-16k",
  // presence_penalty: 0.5,
  // top_p: 1,
  // max_tokens: 400,
  n: 1,
  // stream: false,
  // temperature: 0.7,

  sanatization_streaming: `// catch error
if (res.status >= 300) {
  const err = data?.error?.message || JSON.stringify(data);
  throw err;
}
let resultTexts = [];
const lines = this.chunk.split("\\ndata: ");

const parsedLines = lines
    .map((line) => line.replace(/^data: /, "").trim()) // Remove the "data: " prefix
    .filter((line) => line !== "" && line !== "[DONE]") // Remove empty lines and "[DONE]"
    .map((line) => {
        try {
            return JSON.parse(line)
        } catch { }
    }) // Parse the JSON string
    .filter(Boolean);

for (const parsedLine of parsedLines) {
    const { choices } = parsedLine;
    const { delta } = choices[0];
    const { content } = delta;
    // Update the UI with the new content
    if (content) {
        resultTexts.push(content);
    }
}
return resultTexts.join("");`,
  sanatization_response: `// catch error
if (res.status >= 300) {
  const err = data?.error?.message || JSON.stringify(data);
  throw err;
}

// get choices
const choices = (data.choices || data).map(c=> c.message);

// the return object should be in the format of 
// { content: string }[] 
// if there's only one response, put it in the array of choices.
return choices;`,
};

export type CustomConfig = Record<keyof typeof default_values, string>;

export default class CustomProvider
  extends BaseProvider
  implements LLMProviderInterface
{
  static provider = "Custom";
  static id = "Default (Custom)";
  static displayName = "Custom";

  streamable = true;

  provider = CustomProvider.provider;
  id = CustomProvider.id;
  originalId = CustomProvider.id;

  default_values = default_values;
  async request(
    params: requestWithoutCORSParam & {
      signal?: AbortSignal;
      stream?: boolean;
      onToken?: (token: string, first: boolean) => Promise<void>;
      sanatization_streaming: string;
      sanatization_response: string;
      CORSBypass?: boolean;
    }
  ) {
    const requestOptions: RequestInit = {
      method: params.method || "POST",
      headers: params.headers,
      body: ["GET", "HEAD"].contains(params.method?.toUpperCase() || "_")
        ? undefined
        : params.body,
      redirect: "follow",
      signal: params.signal,
    };

    let k;

    try {
      k = await this.plugin.textGenerator.proxyService.getFetch(
        params.CORSBypass
      )(params.url, requestOptions);
    } catch (e: any) {
      k = e;
    }

    if (!k.ok) {
      const resText = await k.text();
      let resJson = {};

      try {
        resJson = JSON5.parse(resText as any);
      } catch (err: any) {
        resJson = resText;
      }
      throw JSON5.stringify(resJson);
    }

    if (params.stream) {
      if (!k.body) return;
      const reader = k.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let isFirst = true;
      let text = "";

      while (!done) {
        if (params.signal?.aborted) {
          console.log("aborted");
          done = true;
          break;
        }

        const { value, done: doneReading } = await reader.read();
        done = doneReading;

        const decodedVal = decoder.decode(value, { stream: true });

        // backward compatibilty with the old way
        const c =
          params.sanatization_streaming ||
          this.default_values.sanatization_streaming;
        const n = c.split("\n");
        if (n[0]?.trim().startsWith("async")) {
          n.shift();
          n.pop();
        }

        const chunkValue = await runJSInSandbox(n.join("\n"), {
          plugin: this.plugin,
          chunk: decodedVal,
          data: decodedVal,
          res: k,
        });

        text += chunkValue || "";
        await params.onToken?.(chunkValue, isFirst);
        isFirst = false;
      }

      return text as string;
    } else {
      const resText = await k.text();
      let resJson = {};

      try {
        resJson = JSON5.parse(resText as any);
      } catch (err: any) {
        resJson = resText;
      }

      const c =
        params.sanatization_response ||
        this.default_values.sanatization_response;
      const n = c.split("\n");
      if (n[0]?.trim().startsWith("async")) {
        n.shift();
        n.pop();
      }

      const rs = await runJSInSandbox(n.join("\n"), {
        plugin: this.plugin,
        res: k,
        data: resJson,
      });

      console.log(rs);

      return rs?.map((c: Message) =>
        c.type == "image_url"
          ? {
              ...c,
              content: `![](${c.image_url})\n${c.content || ""}`,
            }
          : c
      );
    }
  }

  async generate(
    messages: Message[],
    reqParams: Partial<Omit<LLMConfig, "n">>,
    onToken?: (token: string, first: boolean) => void,
    customConfig?: CustomConfig
  ): Promise<string> {
    return new Promise(async (s, r) => {
      try {
        logger("generate", reqParams);

        let first = true;
        let allText = "";

        const config = (this.plugin.settings.LLMProviderOptions[this.id] ??=
          {});

        let resultContent = "";

        const useRequest = config.CORSBypass && !Platform.isDesktop;

        const handlebarData = {
          ...this.plugin.settings,
          ...cleanConfig(this.default_values),
          ...cleanConfig(config),
          ...cleanConfig(reqParams.otherOptions),
          ...cleanConfig(reqParams),
          ...cleanConfig(customConfig),
          keys: this.plugin.getApiKeys(),
          // if the model is streamable
          stream:
            (reqParams.stream &&
              this.streamable &&
              config.streamable &&
              !useRequest) ||
            false,
          n: 1,
          messages,
        };

        const res = await this.request({
          method: handlebarData.method,
          url: await Handlebars.compile(
            handlebarData.endpoint || this.default_values.endpoint
          )(handlebarData),
          headers: cleanConfig(
            JSON5.parse(
              "" +
                (await Handlebars.compile(
                  handlebarData.custom_header ||
                    this.default_values.custom_header
                )(handlebarData))
            ) as any
          ),

          body: JSON.stringify(
            cleanConfig(
              JSON5.parse(
                "" +
                  (await Handlebars.compile(
                    handlebarData.custom_body || this.default_values.custom_body
                  )(handlebarData))
              )
            ) as any
          ),

          signal: handlebarData.requestParams?.signal || undefined,
          stream: handlebarData.stream,
          sanatization_streaming:
            handlebarData.sanatization_streaming ||
            this.default_values.sanatization_streaming,
          sanatization_response:
            handlebarData.sanatization_response ||
            this.default_values.sanatization_response,
          CORSBypass: handlebarData.CORSBypass,
          async onToken(token: string) {
            onToken?.(token, first);
            allText += token;
            first = false;
          },
        });

        if (typeof res != "object") resultContent = res as string;
        else {
          const choices = res as any;
          if (typeof choices == "string") resultContent = choices;
          else resultContent = choices.map((c: any) => c.content).join("\n");
        }

        logger("generate end", {
          resultContent,
        });

        s(resultContent);
      } catch (errorRequest: any) {
        logger("generate error", errorRequest);
        return r(errorRequest);
      }
    });
  }

  async generateMultiple(
    messages: Message[],
    reqParams: Partial<LLMConfig>,
    customConfig?: CustomConfig
  ): Promise<string[]> {
    return new Promise(async (s, r) => {
      try {
        logger("generateMultiple", reqParams);

        const config = (this.plugin.settings.LLMProviderOptions[this.id] ??=
          {});

        const handlebarData = {
          ...this.plugin.settings,
          ...cleanConfig(config),
          ...cleanConfig(reqParams.otherOptions),
          ...cleanConfig(reqParams),
          ...customConfig,
          // if the model is streamable
          stream: false,
          messages,
        };

        const res = await this.request({
          method: handlebarData.method,
          url: await Handlebars.compile(
            config.endpoint || this.default_values.endpoint
          )(handlebarData),
          signal: handlebarData.requestParams?.signal || undefined,
          stream: handlebarData.stream,
          headers: JSON5.parse(
            await Handlebars.compile(
              handlebarData.custom_header || this.default_values.custom_header
            )(handlebarData)
          ) as any,

          body: JSON.stringify(
            this.cleanConfig(
              JSON5.parse(
                await Handlebars.compile(
                  handlebarData.custom_body || this.default_values.custom_body
                )(handlebarData)
              )
            )
          ) as any,

          sanatization_response: handlebarData.sanatization_response,
          sanatization_streaming:
            handlebarData.sanatization_streaming ||
            this.default_values.sanatization_streaming,
        });

        const choices = res
          ? (res as object[])?.map((o) => get(o, "content"))
          : get(res, "content");

        logger("generateMultiple end", {
          choices,
        });

        if (!handlebarData.stream) {
          s(choices);
        } else r("streaming with multiple choices is not implemented");
      } catch (errorRequest: any) {
        logger("generateMultiple error", errorRequest);
        return r(errorRequest);
      }
    });
  }

  RenderSettings(props: Parameters<LLMProviderInterface["RenderSettings"]>[0]) {
    return <>Default unuseable</>;
  }
}
