import { Adapter } from "./adapter";
import { FormatResult, FormatResultItem, FormatSettings } from "../shared";
import {
  SafeProperty,
  SafePropertyDefinition,
  SafePropertyDefinitions,
  SafePropertyDefinitionMetaMap,
} from "./types";
import { capitalizedNameFromName, propertyNameFromKey } from "./utils";
import { formatInstancesInstanceFromComponent } from "./formatShared";

export function format(
  adapter: Adapter,
  definitionSettings?: FormatSettings,
  instanceSettings?: FormatSettings
): FormatResult {
  return {
    label: "Vue",
    items: [
      formatInstances(adapter, instanceSettings),
      formatDefinitions(adapter, definitionSettings),
    ],
  };
}

function formatDefinitions(
  adapter: Adapter,
  settings: FormatSettings = []
): FormatResultItem {
  const { definitions, metas } = adapter;
  const [isOptionsApi] = settings.map((a) => Boolean(a[1]));
  const lines: string[] = [];
  if (isOptionsApi) {
    lines.push("import { defineComponent, type PropType } from 'vue'");
  }
  Object.keys(definitions).forEach((key) => {
    const properties = definitions[key];

    lines.push(
      isOptionsApi
        ? formatDefinitionsLineForOptionsAPI(key, properties, metas)
        : formatDefinitionsLineForCompositionAPI(key, properties, metas)
    );
  });
  return {
    label: "Definitions",
    code: [
      {
        language: "tsx",
        lines,
      },
    ],
    settings,
    settingsKey: "vueDefinition",
  };
}

function slotFormatter(
  tag: string,
  key: string,
  slotCount: number,
  isDefault = false,
  value: string = ""
) {
  const tagged = value ? `<${tag}>${value}</${tag}>` : `<${tag} />`;
  if (slotCount > 1 && !isDefault) {
    return `<template v-slot:${propertyNameFromKey(key)}>
    ${tagged}
  </template>`;
  }
  return isDefault ? value : tagged;
}

function formatInstances(
  adapter: Adapter,
  settings: FormatSettings = []
): FormatResultItem {
  const [showDefaults, explicitBoolean] = settings.map((a) => Boolean(a[1]));
  const { components } = adapter;
  const lines = [
    Object.values(components)
      .map((component) =>
        formatInstancesInstanceFromComponent(
          component,
          adapter,
          showDefaults,
          explicitBoolean,
          formatInstancesAttributeFromProperty,
          capitalizedNameFromName,
          slotFormatter,
          {
            selfClosing: true,
            instanceSlot: true,
          }
        )
      )
      .join("\n\n"),
  ];
  return {
    label: "Instances",
    code: [
      {
        language: "vue",
        lines,
      },
    ],
    settings,
    settingsKey: "instance",
  };
}

function formatInterfaceProperties(
  interfaceName: string,
  propName: string,
  types: TypeDefinitionsObject,
  definition: SafePropertyDefinition
) {
  const name = propertyNameFromKey(propName);
  if (definition.hidden) {
    return "";
  }
  if (definition.type === "BOOLEAN") {
    return `${name}?: boolean;`;
  } else if (definition.type === "NUMBER") {
    return `${name}?: number;`;
  } else if (definition.type === "TEXT") {
    return `${name}?: string;`;
  } else if (definition.type === "VARIANT") {
    const n = `${interfaceName}${capitalizedNameFromName(propName)}`;
    const value = (definition.variantOptions || [])
      .map((o) => `'${o}'`)
      .join(" | ");
    types[n] = value;
    return `${name}?: ${n};`;
  } else if (definition.type === "EXPLICIT") {
    return `${name}?: "${definition.defaultValue}";`;
  } else if (definition.type === "INSTANCE_SWAP") {
    return `${name}?: Component;`;
  } else {
    return `${name}?: ${JSON.stringify(definition)};`;
  }
}

function formatDefinitionsLineForCompositionAPI(
  key: string,
  properties: SafePropertyDefinitions,
  metas: SafePropertyDefinitionMetaMap
) {
  const componentName = capitalizedNameFromName(metas[key].name);
  const interfaceName = `${componentName}Props`;
  const types: TypeDefinitionsObject = {};
  const interfaceLines = Object.keys(properties)
    .sort()
    .map((propName) =>
      formatInterfaceProperties(
        interfaceName,
        propName,
        types,
        properties[propName]
      )
    )
    .filter(Boolean);
  return [
    `/**`,
    ` * ${componentName}.vue setup`,
    ` */`,
    "",
    ...Object.keys(types).map((name) => `type ${name} = ${types[name]};`),
    "",
    `interface ${interfaceName} { ${interfaceLines.join(" ")} }`,
    "",
    formatComponentPropsFromDefinitionsAndMetas(key, properties, metas),
    "",
  ].join("\n");
}

function formatDefinitionsLineForOptionsAPI(
  key: string,
  properties: SafePropertyDefinitions,
  metas: SafePropertyDefinitionMetaMap
) {
  const types: TypeDefinitionsObject = {};
  const componentName = capitalizedNameFromName(metas[key].name);
  const propsLines = Object.keys(properties)
    .sort()
    .map((propName) =>
      formatDefinitionsOptionsProperties(
        componentName,
        propName,
        types,
        properties[propName]
      )
    )
    .filter(Boolean);
  return [
    [`/**`, ` * ${componentName} Component`, ` */`].join("\n"),
    "",
    ...Object.keys(types).map((name) => `type ${name} = ${types[name]};`),
    "",
    "defineComponent({",
    `name: "${componentName}",`,
    `props: {`,
    propsLines.join("\n"),
    `}`,
    `})`,
  ].join("\n");
}

function formatDefinitionsOptionsProperties(
  componentName: string,
  propName: string,
  types: TypeDefinitionsObject,
  definition: SafePropertyDefinition
) {
  const { name, type, defaultValue, optional } = definition;
  if (definition.hidden) {
    return "";
  }
  const clean = propertyNameFromKey(name);
  if (type === "BOOLEAN") {
    return `${clean}: {
      type: Boolean,
      default: ${defaultValue},
    },`;
  } else if (type === "INSTANCE_SWAP") {
    const node = figma.getNodeById(defaultValue);
    const value = node
      ? node.name === "undefined"
        ? ""
        : `default: "${capitalizedNameFromName(node.name)}";`
      : `default: "${defaultValue}"`;
    return `${clean}: {
        type: ${node ? "Object" : "String"},
        ${value}
      },`;
  } else if (type === "NUMBER") {
    return `${clean}: {
      type: Number,
      default: ${defaultValue},
    },`;
  } else if (type === "VARIANT") {
    const n = `${componentName}${capitalizedNameFromName(propName)}`;
    const value = (definition.variantOptions || [])
      .map((o) => `'${o}'`)
      .join(" | ");
    types[n] = value;
    return `${clean}: {
      type: Object as PropType<${n}>,
      ${
        optional && defaultValue === "undefined"
          ? ""
          : `default: "${defaultValue}",`
      } 
    },`;
  } else {
    return `${clean}: {
      type: String,
      default: "${defaultValue}",
    },`;
  }
}

type TypeDefinitionsObject = { [k: string]: string };

function formatInstancesAttributeFromProperty(
  property: SafeProperty,
  name: string,
  explicitBoolean: boolean
) {
  const clean = propertyNameFromKey(name);
  if (property.undefined) {
    return "";
  }
  if (property.type === "BOOLEAN") {
    return explicitBoolean
      ? `:${clean}="${property.value}"`
      : property.value
      ? clean
      : "";
  } else if (property.type === "NUMBER") {
    return `:${clean}="${property.value}"`;
  } else if (property.type === "INSTANCE_SWAP") {
    const node = figma.getNodeById(property.value);
    return node
      ? `:${clean}="${capitalizedNameFromName(node.name)}"`
      : `:${clean}="${property.value}"`;
  } else {
    return `${clean}="${property.value}"`;
  }
}

function formatComponentPropsFromDefinitionsAndMetas(
  key: string,
  definitions: SafePropertyDefinitions,
  metas: SafePropertyDefinitionMetaMap
): string {
  const meta = metas[key];
  const keys = Object.keys(definitions).sort();
  const propsName = `${capitalizedNameFromName(meta.name)}Props`;
  return `const props = withDefaults(defineProps<${propsName}>(), {
    ${keys
      .map((key) => formatDefinitionInputProperty(definitions[key]))
      .filter(Boolean)
      .join("\n")}
  })`;
}

function formatDefinitionInputProperty(
  definition: SafePropertyDefinition
): string {
  const { name, type, defaultValue } = definition;
  const clean = propertyNameFromKey(name);
  if (definition.hidden) {
    return "";
  }
  if (definition.optional && defaultValue === "undefined") {
    return `${clean},`;
  }
  if (type === "BOOLEAN") {
    return `${clean}: ${defaultValue},`;
  } else if (type === "INSTANCE_SWAP") {
    const node = figma.getNodeById(defaultValue);
    if (definition.optional && node?.name === "undefined") {
      return `${clean},`;
    }
    return node
      ? `${clean}: <${capitalizedNameFromName(node.name)} />,`
      : `${clean}: "${defaultValue}",`;
  } else if (type === "NUMBER") {
    return `${clean}: ${defaultValue},`;
  } else if (type === "VARIANT") {
    return `${clean}: "${defaultValue}",`;
  } else {
    return `${clean}: "${defaultValue}",`;
  }
}
