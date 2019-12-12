import { DependencyNode, DependencyNodeOptions } from '../../dependency-manager/src';

interface LocalServiceNodeOptions {
  service_path: string;
  command?: string;
  api: {
    type: string;
    definitions?: string[];
  };
}

export class LocalServiceNode extends DependencyNode implements LocalServiceNodeOptions {
  __type = 'local';
  service_path!: string;
  command?: string;
  api!: { type: string; definitions?: string[] };

  // @Type(() => ServiceConfig, {
  //   discriminator: {
  //     property: "__type",
  //     subTypes: [
  //       { value: ServiceConfigV1, name: "v1.0.0" },
  //     ],
  //   },
  // })
  // service_config!: ServiceConfig;

  constructor(options: LocalServiceNodeOptions & DependencyNodeOptions) {
    super(options);
  }

  get protocol() {
    return this.api.type === 'grpc' ? '' : 'http://';
  }
}
