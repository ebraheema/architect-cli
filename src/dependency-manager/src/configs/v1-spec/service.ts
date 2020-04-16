import { plainToClass, Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, ValidateIf, ValidateNested } from 'class-validator';
import { ConditionalType } from '../../utils/transform';
import { DatastoreValueFromParameter, ServiceDatastore, ServiceParameter, ValueFromParameter } from '../service';
import { SharedServiceSpecV1, ValueFromParameterSpecV1 } from './shared';

class ParameterDefaultSpecV1 {
  @ValidateNested()
  @IsOptional()
  @Type(() => ValueFromParameterSpecV1)
  value_from?: ValueFromParameterSpecV1;

  @ValidateIf(obj => !obj.value_from)
  @ValidateNested()
  @Type(() => ValueFromParameterSpecV1)
  valueFrom?: ValueFromParameterSpecV1;

  getValueFrom() {
    return this.value_from || this.valueFrom;
  }
}

class ParameterSpecV1 {
  @IsString()
  @IsOptional()
  description?: string;

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
      type: ParameterDefaultSpecV1,
    },
  ])
  default?: string | number | ParameterDefaultSpecV1;

  @ValidateIf(obj => !obj.default)
  @ValidateNested()
  @IsOptional()
  @Type(() => ValueFromParameterSpecV1)
  value_from?: ValueFromParameterSpecV1;

  @ValidateIf(obj => !obj.value_from)
  @Type(() => ValueFromParameterSpecV1)
  valueFrom?: ValueFromParameterSpecV1;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  build_arg?: boolean;

  getNormalized(): ServiceParameter {
    const res: ServiceParameter = {
      description: this.description || '',
      required: this.required !== false && !('default' in this),
    };

    if (this.default && !(this.default instanceof ParameterDefaultSpecV1)) {
      res.default = this.default;
    } else if (this.default || this.value_from || this.valueFrom) {
      const valueFrom = this.default instanceof ParameterDefaultSpecV1
        ? this.default.getValueFrom()
        : this.value_from || this.valueFrom;

      // Weird typescript hack - seems to want every valueFrom to have a datastore
      // ref unless I assign res.default to a more specific type
      if (valueFrom?.datastore) {
        res.default = {
          valueFrom: valueFrom,
        } as DatastoreValueFromParameter;
      } else if (valueFrom) {
        res.default = {
          valueFrom,
        } as ValueFromParameter;
      }
    }

    if (this.build_arg) {
      res.build_arg = this.build_arg;
    }

    return res;
  }
}

class DatastoreSpecV1 {
  @IsNumber()
  port!: number;

  @IsString()
  image!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ParameterSpecV1)
  parameters?: Map<string, ParameterSpecV1>;
}

export class ServiceSpecV1 extends SharedServiceSpecV1 {
  @IsString()
  name!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ParameterSpecV1)
  parameters?: Map<string, string | ParameterSpecV1>;

  @IsOptional()
  @ValidateNested()
  @Type(() => DatastoreSpecV1)
  datastores?: Map<string, DatastoreSpecV1>;

  getName() {
    return this.name;
  }

  getParameters() {
    return SharedServiceSpecV1.normalizeParameters(
      item => typeof item === 'object' ? item.getNormalized() : { default: item, required: false },
      this.parameters,
    );
  }

  setParameter(key: string, value: string | number | ServiceParameter) {
    if (!this.parameters) {
      this.parameters = new Map();
    }

    this.parameters.set(key, plainToClass(ParameterSpecV1, {
      default: value,
    }));
  }

  getDatastores() {
    const res = {} as { [s: string]: ServiceDatastore };

    this.datastores?.forEach((value, key) => {
      if (value.image) {
        if (!value.port) {
          throw new Error('Missing datastore port which is required for provisioning');
        }

        res[key] = {
          ...value,
          parameters: SharedServiceSpecV1.normalizeParameters(
            item => item.getNormalized(),
            value.parameters
          ),
        };
      }
    });

    return res;
  }

  setDatastore(key: string, value: ServiceDatastore) {
    if (!this.datastores) {
      this.datastores = new Map();
    }

    const newValue = new DatastoreSpecV1();
    newValue.image = value.image;
    newValue.port = value.port;
    newValue.parameters = new Map();
    this.datastores.set(key, newValue);


    Object.entries(value.parameters).forEach(([param_key, param_value]) => {
      this.setDatastoreParameter(key, param_key, param_value);
    });
  }

  setDatastoreParameter(datastore: string, param_key: string, param_value: string | ServiceParameter) {
    const config = this.datastores?.get(datastore);
    if (config) {
      if (!config.parameters) {
        config.parameters = new Map();
      }

      config.parameters.set(param_key, plainToClass(ParameterSpecV1, {
        default: param_value,
      }));
      this.datastores?.set(datastore, config);
    }
  }
}
