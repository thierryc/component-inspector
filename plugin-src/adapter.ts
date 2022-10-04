import {
  asBoolean,
  asNumber,
  capitalizedNameFromName,
  isBoolean,
  isNumber,
  propertyNameFromKey,
  RelevantComponentNode,
} from "./utils";
import {
  SafeComponentMap,
  SafeProperties,
  SafeProperty,
  SafePropertyDefinitionMetaMap,
  SafePropertyDefinition,
  SafePropertyDefinitions,
  SafePropertyDefinitionsMap,
  SafePropertyReferencesMap,
} from "./types";

export interface Adapter {
  metas: SafePropertyDefinitionMetaMap;
  definitions: SafePropertyDefinitionsMap;
  components: SafeComponentMap;
  references: SafePropertyReferencesMap;
}

export function adapter(nodes: RelevantComponentNode[]): Adapter {
  const metas: SafePropertyDefinitionMetaMap = {};
  const definitions: SafePropertyDefinitionsMap = {};
  const components: SafeComponentMap = {};
  const references: SafePropertyReferencesMap = {
    instances: {},
    properties: {},
  };
  nodes.forEach((node) => {
    components[node.id] = processNodeInToSafeComponent(
      node,
      definitions,
      metas,
      references
    );
  });
  return { components, definitions, metas, references };
}

function processNodeInToSafeComponent(
  node: RelevantComponentNode,
  allDefinitions: SafePropertyDefinitionsMap,
  allMetas: SafePropertyDefinitionMetaMap,
  allReferences: SafePropertyReferencesMap
) {
  const definitionNode =
    node.type === "INSTANCE"
      ? node.mainComponent?.parent?.type === "COMPONENT_SET"
        ? node.mainComponent?.parent
        : node.mainComponent
      : node;
  const definition = definitionNode?.id || "";
  const name = capitalizedNameFromName(
    definitionNode?.name || "UNNAMEDCOMPONENT"
  );
  const componentPropertyDefinitions = getComponentPropertyDefinitions(node);
  const componentProperties = getComponentProperties(node);
  setSafePropertyReferencesMap(node, allReferences);
  allDefinitions[definition] =
    allDefinitions[definition] ||
    getSafePropertyDefinitions(componentPropertyDefinitions);
  allMetas[definition] = { name, id: definition };
  return {
    id: node.id,
    name,
    definition,
    properties: getSafeProperties(
      allDefinitions[definition],
      componentProperties
    ),
  };
}

function createSafePropertyDefinition(
  key: string,
  componentPropertyDefinitions: ComponentPropertyDefinitions
): SafePropertyDefinition {
  const defs = componentPropertyDefinitions[key];
  const { type } = defs;
  const variantOptions = defs.variantOptions || [];
  const rawValue = `${defs.defaultValue}`;
  const name = propertyNameFromKey(key);

  if (type === "VARIANT") {
    if (variantOptions.length === 1) {
      const defaultValue = isNumber(rawValue)
        ? asNumber(rawValue)
        : isBoolean(rawValue)
        ? asBoolean(rawValue)
        : rawValue;
      return {
        name,
        type: "EXPLICIT",
        defaultValue,
      };
    }

    if (variantOptions.length === 2) {
      if (isBoolean(variantOptions[0]) && isBoolean(variantOptions[1])) {
        return {
          name,
          type: "BOOLEAN",
          defaultValue: asBoolean(rawValue),
        };
      }
    }

    // we could disable this if number variants were desired
    if (!variantOptions.map(isNumber).includes(false)) {
      return {
        name,
        type: "NUMBER",
        defaultValue: asNumber(rawValue),
      };
    }
  }

  switch (type) {
    case "VARIANT":
      return {
        name,
        type: type,
        defaultValue: rawValue,
        variantOptions,
      };
    case "BOOLEAN":
      return {
        name,
        type,
        defaultValue: asBoolean(rawValue),
      };
    case "INSTANCE_SWAP":
    case "TEXT":
    default:
      return {
        name,
        type,
        defaultValue: rawValue,
      };
  }
}

function createSafeProperty(
  key: string,
  definition: SafePropertyDefinition,
  componentProperties: ComponentProperties
): SafeProperty {
  const { type, defaultValue } = definition;
  const property = componentProperties[key];
  const valueString = `${property.value}`;
  const valueBoolean = asBoolean(valueString);
  const valueNumber = asNumber(valueString);
  const name = propertyNameFromKey(key);
  switch (type) {
    case "BOOLEAN":
      return {
        name,
        type,
        value: valueBoolean,
        default: valueBoolean === defaultValue,
      };
    case "EXPLICIT":
      const value = isNumber(valueString)
        ? valueNumber
        : isBoolean(valueString)
        ? valueBoolean
        : valueString;
      return {
        name,
        type,
        value,
        default: value === defaultValue,
      };
    case "NUMBER":
      return {
        name,
        type,
        value: valueNumber,
        default: valueNumber === defaultValue,
      };
    case "INSTANCE_SWAP":
    case "TEXT":
    case "VARIANT":
      return {
        name,
        type,
        value: valueString,
        default: valueString === defaultValue,
      };
  }
}

function getSafePropertyDefinitions(
  componentPropertyDefinitions: ComponentPropertyDefinitions
) {
  const defs: { [k: string]: SafePropertyDefinition } = {};
  for (let key in componentPropertyDefinitions) {
    defs[key] = createSafePropertyDefinition(key, componentPropertyDefinitions);
  }
  return defs;
}

function getSafeProperties(
  definitions: SafePropertyDefinitions,
  componentProperties: ComponentProperties
) {
  const properties: SafeProperties = {};
  for (let key in componentProperties) {
    properties[key] = createSafeProperty(
      key,
      definitions[key],
      componentProperties
    );
  }
  return properties;
}

function getComponentPropertyDefinitions(node: RelevantComponentNode) {
  if (node.type === "INSTANCE") {
    const parent =
      node.mainComponent?.parent?.type === "COMPONENT_SET"
        ? node.mainComponent?.parent
        : node.mainComponent;
    const parentDefinitions = parent?.componentPropertyDefinitions || {};
    return parentDefinitions;
  } else {
    return node.componentPropertyDefinitions;
  }
}

function getComponentProperties(node: RelevantComponentNode) {
  if (node.type === "INSTANCE") {
    return node.componentProperties;
  } else {
    const componentProperties: ComponentProperties = {};
    for (let key in node.componentPropertyDefinitions) {
      const { type, defaultValue } = node.componentPropertyDefinitions[key];
      componentProperties[key] = { type, value: defaultValue };
    }
    return componentProperties;
  }
}

function setSafePropertyReferencesMap(
  node: RelevantComponentNode,
  allReferences: SafePropertyReferencesMap
) {
  const referenceNode = node.type === "COMPONENT" ? node : node.mainComponent;
  const recurse = (nodes: readonly SceneNode[] = []) => {
    nodes.forEach((node) => {
      if (node.componentPropertyReferences) {
        const { characters, visible, mainComponent } =
          node.componentPropertyReferences;
        if (mainComponent) {
          allReferences.instances[mainComponent] = {
            visible,
            characters,
          };
        }
        if (characters || visible) {
          if (characters) {
            allReferences.properties[characters] = { characters: true };
          }
          if (visible) {
            allReferences.properties[visible] = { visible: true };
          }
        }
      }
      if ("children" in node) {
        recurse(node.children);
      }
    });
  };
  if (referenceNode) {
    recurse(referenceNode.children);
  }
}