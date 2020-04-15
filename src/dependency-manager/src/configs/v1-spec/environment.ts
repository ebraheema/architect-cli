import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, ValidateIf, ValidateNested } from 'class-validator';
import { ConditionalType } from '../../utils/transform';
import { EnvironmentConfig } from '../environment';
import { ParameterValue } from '../service';
import { mapToObject, SharedServiceSpecV1, ValueFromParameterSpecV1, VaultValueFromSpecV1 } from './shared';

class IngressSpecV1 {
  @IsString()
  subdomain!: string;
}

class EnvironmentParameterSpecV1 {
  @ValidateNested()
  @IsOptional()
  @ConditionalType([
    {
      matches: value => value.hasOwnProperty('vault'),
      type: VaultValueFromSpecV1,
    },
    {
      matches: value => value.hasOwnProperty('value'),
      type: ValueFromParameterSpecV1,
    },
  ])
  value_from?: VaultValueFromSpecV1 | ValueFromParameterSpecV1;

  @ValidateIf(obj => !obj.value_from)
  @ConditionalType([
    {
      matches: value => value.hasOwnProperty('vault'),
      type: VaultValueFromSpecV1,
    },
    {
      matches: value => value.hasOwnProperty('value'),
      type: ValueFromParameterSpecV1,
    },
  ])
  valueFrom?: VaultValueFromSpecV1 | ValueFromParameterSpecV1;
}

class EnvironmentDatastoreSpecV1 {
  @IsNumber()
  port?: number;

  @IsString()
  image?: string;

  @IsOptional()
  @ValidateNested()
  @ConditionalType([
    {
      matches: value => typeof value === 'string',
      type: String,
    },
    {
      matches: value => typeof value === 'number',
      type: Number,
    },
    {
      matches: value => typeof value === 'object',
      type: EnvironmentParameterSpecV1,
    },
  ])
  parameters?: Map<string, string | number | EnvironmentParameterSpecV1>;
}

class VaultSpecV1 {
  @IsString()
  @IsEnum(['hashicorp-vault'])
  type!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  host!: string;

  @IsString()
  @ValidateIf(obj => !obj.role_id)
  client_token?: string;

  @IsString()
  @IsOptional()
  role_id?: string;

  @IsString()
  @IsOptional()
  secret_id?: string;
}

class DnsConfigSpecV1 {
  @IsOptional()
  searches?: string | string[];
}

class EnvironmentServiceSpecV1 extends SharedServiceSpecV1 {
  @IsOptional()
  @ValidateNested()
  @Type(() => IngressSpecV1)
  ingress?: IngressSpecV1;

  @IsNumber()
  @IsOptional()
  replicas?: number;

  @IsOptional()
  @ValidateNested()
  @ConditionalType([
    {
      matches: value => typeof value === 'string',
      type: String,
    },
    {
      matches: value => typeof value === 'object',
      type: EnvironmentParameterSpecV1,
    },
  ])
  parameters?: Map<string, string | EnvironmentParameterSpecV1>;

  @IsOptional()
  @ValidateNested()
  @Type(() => EnvironmentDatastoreSpecV1)
  datastores?: Map<string, EnvironmentDatastoreSpecV1>;

  getReplicas() {
    return this.replicas || super.getReplicas();
  }

  getIngress() {
    return this.ingress || super.getIngress();
  }

  getParameters() {
    return mapToObject(this.parameters);
  }

  setParameter(key: string, value: string) {
    this.parameters?.set(key, value);
  }

  getDatastores() {
    return mapToObject(this.datastores);
  }

  setDatastoreParameter(datastore: string, param_key: string, param_value: ParameterValue) {
    const config = this.datastores?.get(datastore);
    if (config) {
      config.parameters?.set(param_key, param_value);
      this.datastores?.set(datastore, config);
    }
  }
}

export class EnvironmentSpecV1 extends EnvironmentConfig {
  @IsString()
  @IsOptional()
  __version = '1.0.0';

  @IsOptional()
  @ValidateNested()
  @ConditionalType([
    {
      matches: value => typeof value === 'string',
      type: String,
    },
    {
      matches: value => typeof value === 'object',
      type: EnvironmentParameterSpecV1,
    },
  ])
  parameters?: Map<string, string | EnvironmentParameterSpecV1>;

  @ValidateNested()
  @Type(() => EnvironmentServiceSpecV1)
  services!: Map<string, EnvironmentServiceSpecV1>;

  @IsOptional()
  @ValidateNested()
  @Type(() => VaultSpecV1)
  vaults?: Map<string, VaultSpecV1>;

  @IsOptional()
  @ValidateNested()
  @Type(() => DnsConfigSpecV1)
  dns?: DnsConfigSpecV1;

  getDnsConfig() {
    return this.dns || {};
  }

  getVaults() {
    return mapToObject(this.vaults);
  }

  getParameters() {
    return mapToObject(this.parameters);
  }

  getServices() {
    return mapToObject(this.services);
  }
}
