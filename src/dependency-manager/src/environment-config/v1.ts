import { Allow, IsObject, IsOptional, ValidatorOptions } from 'class-validator';
import { InterfaceSpec, ParameterValue } from '..';
import { ComponentConfig } from '../component-config/base';
import { ComponentConfigBuilder } from '../component-config/builder';
import { ComponentContextV1, ParameterValueSpecV1, transformInterfaces } from '../component-config/v1';
import { InterfaceSpecV1, transformParameters } from '../service-config/v1';
import { Dictionary } from '../utils/dictionary';
import { normalizeInterpolation } from '../utils/interpolation';
import { ComponentVersionSlugUtils, Slugs } from '../utils/slugs';
import { validateDictionary } from '../utils/validation';
import { EnvironmentConfig, EnvironmentVault } from './base';

interface DnsConfigSpec {
  searches?: string | string[];
}

export const transformComponents = (input?: Dictionary<any>, parent?: any): Dictionary<ComponentConfig> | undefined => {
  if (!input) {
    return {};
  }
  if (!(input instanceof Object)) {
    return input;
  }

  const output: Dictionary<ComponentConfig> = {};
  // eslint-disable-next-line prefer-const
  for (let [key, value] of Object.entries(input)) {
    if (!value) value = {};
    if (value instanceof Object) {
      if (value.extends && !value.extends.includes(':')) {
        value.extends = `${key}:${value.extends}`;
      }
      output[key] = ComponentConfigBuilder.buildFromJSON({ extends: key, ...value, name: key });
    } else {
      output[key] = ComponentConfigBuilder.buildFromJSON({ extends: value.includes(':') || value.startsWith('file:') ? value : `${key}:${value}`, name: key });
    }
  }
  return output;
};

interface EnvironmentContextV1 {
  interfaces: Dictionary<InterfaceSpec>;
  parameters: Dictionary<ParameterValue>;
  components: Dictionary<ComponentContextV1>;
}

export class EnvironmentConfigV1 extends EnvironmentConfig {
  @Allow({ always: true })
  __version?: string;

  @IsOptional({ always: true })
  @IsObject({ always: true })
  protected parameters?: Dictionary<ParameterValueSpecV1>;

  @IsOptional({ always: true })
  @IsObject({ always: true })
  protected components?: Dictionary<ComponentConfig | string>;

  @IsOptional({ always: true })
  @IsObject({ always: true })
  protected vaults?: Dictionary<EnvironmentVault>;

  @IsOptional({ always: true })
  protected dns?: DnsConfigSpec;

  @IsOptional({ groups: ['operator', 'debug'] })
  protected interfaces?: Dictionary<InterfaceSpecV1 | string>;

  getDnsConfig(): DnsConfigSpec {
    return this.dns || {};
  }

  getParameters() {
    return transformParameters(this.parameters) || {};
  }

  setParameters(value: Dictionary<ParameterValueSpecV1>) {
    this.parameters = value;
  }

  setParameter(key: string, value: ParameterValueSpecV1) {
    if (!this.parameters) {
      this.parameters = {};
    }
    this.parameters[key] = value;
  }

  getComponents(): Dictionary<ComponentConfig> {
    return transformComponents(this.components) || {};
  }

  setComponents(value: Dictionary<ComponentConfig | string>) {
    this.components = value;
  }

  setComponent(key: string, value: ComponentConfig | string) {
    if (!this.components) {
      this.components = {};
    }
    this.components[key] = value;
  }

  getVaults() {
    return this.vaults || {};
  }

  setVaults(value: Dictionary<EnvironmentVault>) {
    this.vaults = value;
  }

  setVault(key: string, value: EnvironmentVault) {
    if (!this.vaults) {
      this.vaults = {};
    }
    this.vaults[key] = value;
  }

  getInterfaces() {
    return transformInterfaces(this.interfaces) || {};
  }

  setInterfaces(value: Dictionary<InterfaceSpecV1 | string>) {
    this.interfaces = value;
  }

  setInterface(key: string, value: InterfaceSpecV1 | string) {
    if (!this.interfaces) {
      this.interfaces = {};
    }
    this.interfaces[key] = value;
  }

  getContext(): EnvironmentContextV1 {
    const interfaces: Dictionary<InterfaceSpec> = {};
    for (const [ik, iv] of Object.entries(this.getInterfaces())) {
      interfaces[ik] = iv;
    }

    const parameters: Dictionary<ParameterValue> = {};
    for (const [pk, pv] of Object.entries(this.getParameters())) {
      parameters[pk] = pv.default === undefined ? '' : pv.default;
    }

    const components: Dictionary<ComponentContextV1> = {};
    for (const [ck, cv] of Object.entries(this.getComponents())) {
      const normalized_ck = normalizeInterpolation(ck);
      components[normalized_ck] = cv.getContext();
    }

    return {
      interfaces,
      parameters,
      components,
    };
  }

  async validate(options?: ValidatorOptions) {
    if (!options) options = {};
    let errors = await super.validate(options);
    if (errors.length) return errors;
    const expanded = this.expand();
    errors = await validateDictionary(expanded, 'parameters', errors, undefined, options, new RegExp(`^${Slugs.ComponentParameterRegexBase}$`));
    errors = await validateDictionary(expanded, 'components', errors, undefined, options, new RegExp(`^${ComponentVersionSlugUtils.RegexOptionalTag}$`));
    return errors;
  }
}
