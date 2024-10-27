import React from "react";
import LLMProviderInterface from "../interface";
import useGlobal from "#/ui/context/global";
import SettingItem from "#/ui/settings/components/item";
import Input from "#/ui/settings/components/input";
import CustomProvider from "./base";
import { ModelsHandler } from "../utils";
import { IconExternalLink } from "@tabler/icons-react";

const default_values = {
  endpoint: "http://localhost:3001/api/chat",
  model: "claude-3-haiku-20240307",
  temperature: 0.7,
  max_tokens: 4000,
  timeout: 30000,
  streamable: true,
  custom_header: `{                                                                                                                                                                                                                                                                                      
     "Content-Type": "application/json"                                                                                                                                                                                                                                                                   
   }`,
  custom_body: `{                                                                                                                                                                                                                                                                                        
     messages: {{stringify messages}},                                                                                                                                                                                                                                                                              
     model: "{{model}}",                                                                                                                                                                                                                                                                                  
     temperature: {{temperature}},                                                                                                                                                                                                                                                                        
     max_tokens: {{max_tokens}},                                                                                                                                                                                                                                                                          
     timeout: {{timeout}},                                                                                                                                                                                                                                                                                
     stream: {{stream}},
     debug: {{debugMode}}                                                                                                                                                                                                                                                                                   
}`,
  sanatization_streaming: `// catch error
if (res.status >= 300) {
  const err = data?.error?.message || JSON.stringify(data);
  throw err;
}

let resultTexts = [];
const lines = this.chunk.split(/\\n/).filter(line => line.trim());

for (const line of lines) {
  // stringify the line to check if it's a valid JSON
  if (!line.startsWith('data: ')) continue;
  
  try {
    const jsonStr = line.replace(/^data: /, '').trim();
    if (jsonStr === '[DONE]') continue;
    
    const parsed = JSON.parse(jsonStr);
    
    // Handle Claude's specific response format
    if (parsed?.type === 'content_block_delta' && parsed?.delta?.text) {
      resultTexts.push(parsed.delta.text);
    } else if (parsed?.type === 'content_block_start' && parsed?.content?.[0]?.text) {
      resultTexts.push(parsed.content[0].text);
    } else if (parsed?.content?.[0]?.text) {
      resultTexts.push(parsed.content[0].text);
    } else if (typeof parsed?.content === 'string') {
      resultTexts.push(parsed.content);
    }
  } catch (e) {
    // Skip invalid JSON
    continue;
  }
}

return resultTexts.join("");`,
  sanatization_response: `// catch error
if (res.status >= 300) {
  const err = data?.error?.message || JSON.stringify(data);
  throw err;
}

// Extract text content from the response
const content = data.content;

return content;`,
};

export type CustomConfig = Record<keyof typeof default_values, string>;

export default class ProxyAnthropicProvider
  extends CustomProvider
  implements LLMProviderInterface
{
  streamable = true;
  static provider = "Custom";
  static id = "Proxy Anthropic" as const;
  static slug = "proxy-anthropic" as const;
  static displayName = "Proxy Anthropic";

  provider = ProxyAnthropicProvider.provider;
  id = ProxyAnthropicProvider.id;
  originalId = ProxyAnthropicProvider.id;

  default_values = default_values;

  RenderSettings(props: Parameters<LLMProviderInterface["RenderSettings"]>[0]) {
    const global = useGlobal();
    const config = (global.plugin.settings.LLMProviderOptions[props.self.id] ??=
      { ...default_values });

    return (
      <>
        <SettingItem
          name="Endpoint"
          description="The URL of your proxy server"
          register={props.register}
          sectionId={props.sectionId}
        >
          <Input
            value={config.endpoint || default_values.endpoint}
            placeholder="Enter your proxy endpoint"
            setValue={async (value) => {
              config.endpoint = value;
              global.triggerReload();
              await global.plugin.saveSettings();
            }}
          />
        </SettingItem>

        <ModelsHandler
          register={props.register}
          sectionId={props.sectionId}
          llmProviderId={props.self.originalId || props.self.id}
          default_values={default_values}
        />

        <div className="plug-tg-flex plug-tg-flex-col plug-tg-gap-2">
          <div className="plug-tg-text-lg plug-tg-opacity-70">Useful links</div>
          <a href="https://docs.anthropic.com/claude/reference/getting-started-with-the-api">
            <SettingItem
              name="Getting started"
              className="plug-tg-text-xs plug-tg-opacity-50 hover:plug-tg-opacity-100"
              register={props.register}
              sectionId={props.sectionId}
            >
              <IconExternalLink />
            </SettingItem>
          </a>
          <a href="https://docs.anthropic.com/claude/reference/selecting-a-model">
            <SettingItem
              name="Available models"
              className="plug-tg-text-xs plug-tg-opacity-50 hover:plug-tg-opacity-100"
              register={props.register}
              sectionId={props.sectionId}
            >
              <IconExternalLink />
            </SettingItem>
          </a>
        </div>
      </>
    );
  }
}
