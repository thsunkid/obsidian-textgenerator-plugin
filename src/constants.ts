import MODELS from "#/lib/models";

export const AI_MODELS = MODELS;

// ignore in yaml, these items will be removed when running removeYaml function,
export const IGNORE_IN_YAML: Record<string, true> = {
  PromptInfo: true,
  config: true,
  // position: true,
  system: true,
  messages: true,
  max_tokens: true,
  max_completion_tokens: true,
  stream: true,
  provider: true,
  disableProvider: true,
  endpoint: true,
  output: true,

  // objects
  body: true,
  headers: true,
  // langchain stuff
  chain: true,
  splitter: true,

  // custom
  path_to_error_message: true,
  path_to_choices: true,
  path_to_message_content: true,

  // mapping
  bodyParams: true,
  reqParams: true,
  custom_body: true,
  custom_header: true,
};

export const DecryptKeyPrefix = "__@#key_prefix#@__";

// icons for obsidian buttons
export const GENERATE_ICON = `<defs><style>.cls-1{fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:4px;}</style></defs><g id="Layer_2" data-name="Layer 2"><g id="VECTOR"><rect class="cls-1" x="74.98" y="21.55" width="18.9" height="37.59"/><path class="cls-1" d="M38.44,27.66a8,8,0,0,0-8.26,1.89L24.8,34.86a25.44,25.44,0,0,0-6,9.3L14.14,56.83C11.33,64.7,18.53,67.3,21,60.9" transform="translate(-1.93 -15.75)"/><polyline class="cls-1" points="74.98 25.58 56.61 18.72 46.72 15.45"/><path class="cls-1" d="M55.45,46.06,42.11,49.43,22.76,50.61c-8.27,1.3-5.51,11.67,4.88,12.8L46.5,65.78,53,68.4a23.65,23.65,0,0,0,17.9,0l6-2.46" transform="translate(-1.93 -15.75)"/><path class="cls-1" d="M37.07,64.58v5.91A3.49,3.49,0,0,1,33.65,74h0a3.49,3.49,0,0,1-3.45-3.52V64.58" transform="translate(-1.93 -15.75)"/><path class="cls-1" d="M48,66.58v5.68a3.4,3.4,0,0,1-3.34,3.46h0a3.4,3.4,0,0,1-3.34-3.45h0V65.58" transform="translate(-1.93 -15.75)"/><polyline class="cls-1" points="28.75 48.05 22.66 59.3 13.83 65.61 14.41 54.5 19.11 45.17"/><polyline class="cls-1" points="25.17 34.59 43.75 0.25 52.01 5.04 36.39 33.91"/><line class="cls-1" x1="0.25" y1="66.92" x2="13.83" y2="66.92"/></g></g>`;

export const GENERATE_META_ICON = `<defs><style>.cls-1{fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:4px;}</style></defs><g id="Layer_2" data-name="Layer 2"><g id="VECTOR"><rect class="cls-1" x="77.39" y="35.84" width="18.9" height="37.59"/><path class="cls-1" d="M38.44,27.66a8,8,0,0,0-8.26,1.89L24.8,34.86a25.44,25.44,0,0,0-6,9.3L14.14,56.83C11.33,64.7,18.53,67.3,21,60.9" transform="translate(0.47 -1.45)"/><polyline class="cls-1" points="77.39 39.88 59.02 33.01 49.13 29.74"/><path class="cls-1" d="M55.45,46.06,42.11,49.43,22.76,50.61c-8.27,1.3-5.51,11.67,4.88,12.8L46.5,65.78,53,68.4a23.65,23.65,0,0,0,17.9,0l6-2.46" transform="translate(0.47 -1.45)"/><path class="cls-1" d="M37.07,64.58v5.91A3.49,3.49,0,0,1,33.65,74h0a3.49,3.49,0,0,1-3.45-3.52V64.58" transform="translate(0.47 -1.45)"/><path class="cls-1" d="M48,66.58v5.68a3.4,3.4,0,0,1-3.34,3.46h0a3.4,3.4,0,0,1-3.34-3.45h0V65.58" transform="translate(0.47 -1.45)"/><polyline class="cls-1" points="31.15 62.35 25.07 73.59 16.23 79.91 16.82 68.79 21.52 59.46"/><polyline class="cls-1" points="27.58 48.89 46.16 14.54 54.42 19.34 38.8 48.2"/><line class="cls-1" x1="2.66" y1="81.22" x2="16.24" y2="81.22"/></g></g><line class="cls-1" x1="25.78" y1="2" x2="39.9" y2="2"/><line class="cls-1" x1="47.36" y1="2" x2="61.47" y2="2"/><line class="cls-1" x1="3.17" y1="2" x2="17.28" y2="2"/><line class="cls-1" x1="24.62" y1="95.6" x2="38.73" y2="95.6"/><line class="cls-1" x1="46.19" y1="95.6" x2="60.31" y2="95.6"/><line class="cls-1" x1="2" y1="95.6" x2="16.11" y2="95.6"/>`;
