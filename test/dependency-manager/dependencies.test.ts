import { expect } from '@oclif/test';
import axios from 'axios';
import mock_fs from 'mock-fs';
import moxios from 'moxios';
import sinon from 'sinon';
import Build from '../../src/commands/build';
import LocalDependencyManager from '../../src/common/dependency-manager/local-manager';
import { ServiceNode } from '../../src/dependency-manager/src';

describe('dependencies', function () {
  beforeEach(async () => {
    // Stub the logger
    sinon.replace(Build.prototype, 'log', sinon.stub());
    moxios.install();
  });

  afterEach(function () {
    // Restore stubs
    sinon.restore();
    // Restore fs
    mock_fs.restore();
    moxios.uninstall();
  });

  describe('standard dependencies', function () {
    it('simple frontend with backend dependency', async () => {
      const frontend_config = {
        name: 'architect/frontend',
        dependencies: {
          'architect/backend': 'latest'
        }
      };

      const backend_config = {
        name: 'architect/backend'
      };

      const env_config = {
        services: {
          'architect/frontend': {
            debug: {
              path: './src/frontend'
            }
          },
          'architect/backend': {
            debug: {
              path: './src/backend'
            }
          },
        }
      };

      mock_fs({
        '/stack/src/frontend/architect.json': JSON.stringify(frontend_config),
        '/stack/src/backend/architect.json': JSON.stringify(backend_config),
        '/stack/arc.env.json': JSON.stringify(env_config),
      });

      const manager = await LocalDependencyManager.createFromPath(axios.create(), '/stack/arc.env.json', undefined, true);
      const graph = manager.graph;
      expect(graph.nodes).length(2);
      expect(graph.edges).length(1);
    });

    it('two services that share a postgres db', async () => {
      moxios.stubRequest(`/accounts/postgres/services/postgres/versions/11`, {
        status: 200,
        response: { tag: '11', config: { name: 'postgres/postgres' }, service: { url: 'postgres:11' } }
      });

      const service_config1 = {
        name: 'architect/service1',
        dependencies: {
          'postgres/postgres': '11'
        }
      };

      const service_config2 = {
        name: 'architect/service2',
        dependencies: {
          'postgres/postgres': '11'
        }
      };

      const env_config = {
        services: {
          'architect/service1': {
            debug: {
              path: './src/service1'
            }
          },
          'architect/service2': {
            debug: {
              path: './src/service2'
            }
          },
        }
      };

      mock_fs({
        '/stack/src/service1/architect.json': JSON.stringify(service_config1),
        '/stack/src/service2/architect.json': JSON.stringify(service_config2),
        '/stack/arc.env.json': JSON.stringify(env_config),
      });

      const manager = await LocalDependencyManager.createFromPath(axios.create(), '/stack/arc.env.json', undefined, true);
      const graph = manager.graph;
      expect(graph.nodes).length(3);
      expect(graph.edges).length(2);
    });

    it('two services that use different postgres dbs', async () => {
      moxios.stubRequest(`/accounts/postgres/services/postgres/versions/11`, {
        status: 200,
        response: { tag: '11', config: { name: 'postgres/postgres' }, service: { url: 'postgres:11' } }
      });
      moxios.stubRequest(`/accounts/postgres/services/postgres/versions/12`, {
        status: 200,
        response: { tag: '12', config: { name: 'postgres/postgres' }, service: { url: 'postgres:12' } }
      });

      const service_config1 = {
        name: 'architect/service1',
        dependencies: {
          'postgres/postgres': '11'
        }
      };

      const service_config2 = {
        name: 'architect/service2',
        dependencies: {
          'postgres/postgres': '12'
        }
      };

      const env_config = {
        services: {
          'architect/service1': {
            debug: {
              path: './src/service1'
            }
          },
          'architect/service2': {
            debug: {
              path: './src/service2'
            }
          },
        }
      };

      mock_fs({
        '/stack/src/service1/architect.json': JSON.stringify(service_config1),
        '/stack/src/service2/architect.json': JSON.stringify(service_config2),
        '/stack/arc.env.json': JSON.stringify(env_config),
      });

      const manager = await LocalDependencyManager.createFromPath(axios.create(), '/stack/arc.env.json', undefined, true);
      const graph = manager.graph;
      expect(graph.nodes).length(4);
      expect(graph.edges).length(2);
    });
  });


  describe('inline dependencies', function () {
    it('simple frontend with inline backend dependency', async () => {
      const frontend_config = {
        name: 'architect/frontend',
        dependencies: {
          'architect/backend': {
            image: 'inline'
          }
        }
      };

      const env_config = {
        services: {
          'architect/frontend': {
            debug: {
              path: './src/frontend'
            }
          }
        }
      };

      mock_fs({
        '/stack/src/frontend/architect.json': JSON.stringify(frontend_config),
        '/stack/arc.env.json': JSON.stringify(env_config),
      });

      const manager = await LocalDependencyManager.createFromPath(axios.create(), '/stack/arc.env.json', undefined, true);
      const graph = manager.graph;
      expect(graph.nodes).length(2);
      expect(graph.edges).length(1);
    });

    it('two services that use different inline postgres dbs', async () => {
      const service_config1 = {
        name: 'architect/service1',
        dependencies: {
          'postgres/postgres': {
            image: 'postgres:11',
            parameters: {
              POSTGRES_DB: 'service1'
            }
          }
        }
      };

      const service_config2 = {
        name: 'architect/service2',
        dependencies: {
          'postgres/postgres': {
            image: 'postgres:11',
            parameters: {
              POSTGRES_DB: 'service2'
            }
          }
        }
      };

      const env_config = {
        services: {
          'architect/service1': {
            debug: {
              path: './src/service1'
            }
          },
          'architect/service2': {
            debug: {
              path: './src/service2'
            }
          },
        }
      };

      mock_fs({
        '/stack/src/service1/architect.json': JSON.stringify(service_config1),
        '/stack/src/service2/architect.json': JSON.stringify(service_config2),
        '/stack/arc.env.json': JSON.stringify(env_config),
      });

      const manager = await LocalDependencyManager.createFromPath(axios.create(), '/stack/arc.env.json', undefined, true);
      const graph = manager.graph;
      expect(graph.nodes).length(4);
      expect(graph.edges).length(2);
    });

    it('two services that use the same inline postgres db, but inline is private so we create two dbs', async () => {
      const service_config1 = {
        name: 'architect/service1',
        dependencies: {
          'postgres/postgres': {
            image: 'postgres:11',
            parameters: {
              POSTGRES_DB: 'shared'
            }
          }
        }
      };

      const service_config2 = {
        name: 'architect/service2',
        dependencies: {
          'postgres/postgres': {
            image: 'postgres:11',
            parameters: {
              POSTGRES_DB: 'shared'
            }
          }
        }
      };

      const env_config = {
        services: {
          'architect/service1': {
            debug: {
              path: './src/service1'
            }
          },
          'architect/service2': {
            debug: {
              path: './src/service2'
            }
          },
        }
      };

      mock_fs({
        '/stack/src/service1/architect.json': JSON.stringify(service_config1),
        '/stack/src/service2/architect.json': JSON.stringify(service_config2),
        '/stack/arc.env.json': JSON.stringify(env_config),
      });

      const manager = await LocalDependencyManager.createFromPath(axios.create(), '/stack/arc.env.json', undefined, true);
      const graph = manager.graph;
      expect(graph.nodes).length(4);
      expect(graph.edges).length(2);
    });

    it('inline service in env config', async () => {
      const env_config = {
        services: {
          'architect/inline-service': {
            parameters: {
              WORKED: 1
            }
          }
        }
      };

      mock_fs({
        '/stack/arc.env.json': JSON.stringify(env_config),
      });

      const manager = await LocalDependencyManager.createFromPath(axios.create(), '/stack/arc.env.json', undefined, true);
      const graph = manager.graph;
      expect(graph.nodes).length(1);
      expect((graph.nodes[0] as ServiceNode).service_config.getParameters()).keys(['WORKED']);
      expect((graph.nodes[0] as ServiceNode).service_config.getParameters().WORKED.default).eq(1);
      expect((graph.nodes[0] as ServiceNode).node_config.getParameters()).keys(['WORKED']);
      expect((graph.nodes[0] as ServiceNode).node_config.getParameters().WORKED.default).eq(1);
      expect(graph.edges).length(0);
    });
  });


  describe('ref dependencies', function () {
    it('simple ref dependency', async () => {
      moxios.stubRequest(`/accounts/postgres/services/postgres/versions/11`, {
        status: 200,
        response: { tag: '11', config: { name: 'postgres/postgres' }, service: { url: 'postgres:11' } }
      });

      const backend_config = {
        name: 'architect/backend',
        dependencies: {
          'db': 'postgres/postgres:11'
        }
      };

      const env_config = {
        services: {
          'architect/backend': {
            debug: {
              path: './src/backend'
            }
          }
        }
      };

      mock_fs({
        '/stack/src/backend/architect.json': JSON.stringify(backend_config),
        '/stack/arc.env.json': JSON.stringify(env_config),
      });

      const manager = await LocalDependencyManager.createFromPath(axios.create(), '/stack/arc.env.json', undefined, true);
      const graph = manager.graph;
      expect(graph.nodes).length(2);
      expect(graph.nodes[0].ref).eq('architect/backend:latest');
      expect(graph.nodes[1].ref).eq('db:latest');
      expect(graph.edges).length(1);
    });

    it('ref env config with dependencies', async () => {
      moxios.stubRequest(`/accounts/architect/services/checkout-service/versions/latest`, {
        status: 200,
        response: { tag: 'latest', config: { name: 'architect/checkout-service', parameters: { WORKED: 0 } }, service: { url: 'architect/checkout-service:latest' } }
      });

      moxios.stubRequest(`/accounts/architect/services/payments-service/versions/v1`, {
        status: 200,
        response: { tag: 'v1', config: { name: 'architect/payments-service', parameters: { WORKED: 0 } }, service: { url: 'architect/payments-service:v1' } }
      });

      const env_config = {
        services: {
          'architect/checkout-service': {
            extends: 'latest',
            parameters: { WORKED: 1 },
            dependencies: {
              'architect/payments-service': {
                extends: 'v1',
                parameters: { WORKED: 1 }
              }
            }
          }
        }
      };

      mock_fs({
        '/stack/arc.env.json': JSON.stringify(env_config),
      });

      const manager = await LocalDependencyManager.createFromPath(axios.create(), '/stack/arc.env.json', undefined, true);
      const graph = manager.graph;
      expect(graph.nodes).length(2);
      expect(graph.edges).length(1);

      expect((graph.nodes[0] as ServiceNode).node_config.getParameters()).keys(['WORKED']);
      expect((graph.nodes[0] as ServiceNode).node_config.getParameters().WORKED.default).eq(1);
      expect((graph.nodes[1] as ServiceNode).node_config.getParameters()).keys(['WORKED']);
      expect((graph.nodes[1] as ServiceNode).node_config.getParameters().WORKED.default).eq(1);
    });

    it('load service and then load dependencies', async () => {
      const service_config = {
        parameters: { WORKED: 1 },
        dependencies: {
          'architect/payments-service': {
            extends: 'v1',
            parameters: { WORKED: 1 }
          }
        }
      }
      moxios.stubRequest(`/accounts/architect/services/checkout-service/versions/latest`, {
        status: 200,
        response: { tag: 'latest', config: service_config, service: { url: 'architect/checkout-service:latest' } }
      });

      moxios.stubRequest(`/accounts/architect/services/payments-service/versions/v1`, {
        status: 200,
        response: { tag: 'v1', config: { name: 'architect/payments-service', parameters: { WORKED: 0 } }, service: { url: 'architect/payments-service:v1' } }
      });

      const env_config = {
        services: {
          'architect/checkout-service:latest': {}
        }
      };

      mock_fs({
        '/stack/arc.env.json': JSON.stringify(env_config),
      });

      const manager = await LocalDependencyManager.createFromPath(axios.create(), '/stack/arc.env.json', undefined, true);
      const graph = manager.graph;
      expect(graph.nodes).length(2);
      expect(graph.edges).length(1);

      expect((graph.nodes[0] as ServiceNode).node_config.getParameters()).keys(['WORKED']);
      expect((graph.nodes[0] as ServiceNode).node_config.getParameters().WORKED.default).eq(1);
      expect((graph.nodes[1] as ServiceNode).node_config.getParameters()).keys(['WORKED']);
      expect((graph.nodes[1] as ServiceNode).node_config.getParameters().WORKED.default).eq(1);
    });

    it('load service and then load dependencies with override in env config', async () => {
      const service_config = {
        parameters: { WORKED: 1 },
        dependencies: {
          'architect/payments-service': {
            extends: 'v1',
            parameters: { WORKED: 1 }
          }
        }
      }
      moxios.stubRequest(`/accounts/architect/services/checkout-service/versions/latest`, {
        status: 200,
        response: { tag: 'latest', config: service_config, service: { url: 'architect/checkout-service:latest' } }
      });

      moxios.stubRequest(`/accounts/architect/services/payments-service/versions/v1`, {
        status: 200,
        response: { tag: 'v1', config: { name: 'architect/payments-service', parameters: { WORKED: 0 } }, service: { url: 'architect/payments-service:v1' } }
      });

      const env_config = {
        services: {
          'architect/checkout-service:latest': {
            dependencies: {
              'architect/payments-service': {
                parameters: { WORKED: 2 }
              }
            }
          }
        }
      };

      mock_fs({
        '/stack/arc.env.json': JSON.stringify(env_config),
      });

      const manager = await LocalDependencyManager.createFromPath(axios.create(), '/stack/arc.env.json', undefined, true);
      const graph = manager.graph;
      expect(graph.nodes).length(2);
      expect(graph.edges).length(1);

      expect((graph.nodes[0] as ServiceNode).service_config.getParameters()).keys(['WORKED']);
      expect((graph.nodes[0] as ServiceNode).service_config.getParameters().WORKED.default).eq(1);
      expect((graph.nodes[0] as ServiceNode).node_config.getParameters()).keys(['WORKED']);
      expect((graph.nodes[0] as ServiceNode).node_config.getParameters().WORKED.default).eq(1);

      expect((graph.nodes[1] as ServiceNode).service_config.getParameters()).keys(['WORKED']);
      expect((graph.nodes[1] as ServiceNode).service_config.getParameters().WORKED.default).eq(0);
      expect((graph.nodes[1] as ServiceNode).node_config.getParameters()).keys(['WORKED']);
      expect((graph.nodes[1] as ServiceNode).node_config.getParameters().WORKED.default).eq(2);
    });

    it('chained refs', async () => {
      const service_config = {
        name: 'forked/payments-service',
        extends: 'architect/payments-service:v1'
      }

      moxios.stubRequest(`/accounts/forked/services/payments-service/versions/v1`, {
        status: 200,
        response: { tag: 'v1', config: service_config, service: { url: 'forked/payments-service:v1' } }
      });

      moxios.stubRequest(`/accounts/architect/services/payments-service/versions/v1`, {
        status: 200,
        response: { tag: 'v1', config: { name: 'architect/payments-service', parameters: { WORKED: 1 } }, service: { url: 'architect/payments-service:v1' } }
      });

      const env_config = {
        services: {
          'forked/payments-service': 'v1'
        }
      };

      mock_fs({
        '/stack/arc.env.json': JSON.stringify(env_config),
      });

      const manager = await LocalDependencyManager.createFromPath(axios.create(), '/stack/arc.env.json', undefined, true);
      const graph = manager.graph;
      expect(graph.nodes).length(1);
      expect((graph.nodes[0] as ServiceNode).node_config.getParameters()).keys(['WORKED']);
      expect(graph.edges).length(0);
    });
  });
});