import { expect } from 'chai';
import mock_fs from 'mock-fs';
import moxios from 'moxios';
import path from 'path';
import sinon from 'sinon';
import Register from '../../src/commands/register';
import PortUtil from '../../src/common/utils/port';
import { EnvironmentConfigBuilder } from '../../src/dependency-manager/src';
import { ComponentConfigBuilder } from '../../src/dependency-manager/src/component-config/builder';

describe('config spec v1', () => {
  beforeEach(async () => {
    // Stub the logger
    sinon.replace(Register.prototype, 'log', sinon.stub());
    moxios.install();
    moxios.wait(function () {
      let request = moxios.requests.mostRecent()
      if (request) {
        request.respondWith({
          status: 404,
        })
      }
    })
    sinon.replace(PortUtil, 'isPortAvailable', async () => true);
    PortUtil.reset();
  });

  afterEach(function () {
    // Restore stubs
    sinon.restore();
    // Restore fs
    mock_fs.restore();
    moxios.uninstall();
  });

  it('simple configs', async () => {
    const component_yml = `
      name: test/component
      services:
        stateless-app:
          interfaces:
            main: 8080
      interfaces:
        frontend: \${{ services['stateless-app'].interfaces.main.url }}
      `
    const environment_yml = `
      interfaces:
        frontend: \${{ components.test/component.interfaces.frontend.url }}
      components:
        test/component: file:./architect.yml
      `
    mock_fs({
      '/architect.yml': component_yml,
      '/environment.yml': environment_yml
    });

    const component_config = await ComponentConfigBuilder.buildFromPath('/architect.yml');
    expect(component_config).to.deep.eq({
      "name": "test/component",
      "services": {
        "stateless-app": {
          "interfaces": {
            "main": 8080
          }
        }
      },
      "interfaces": {
        "frontend": "${{ services['stateless-app'].interfaces.main.url }}"
      }
    })

    const env_config = await EnvironmentConfigBuilder.buildFromPath('/environment.yml');
    expect(env_config).to.deep.eq({
      "interfaces": {
        "frontend": "${{ components.test/component.interfaces.frontend.url }}"
      },
      "components": {
        "test/component": {
          "extends": `file:${path.resolve('/architect.yml')}`,
          "name": "test/component"
        }
      }
    })
  });

  it('configs with yaml refs', async () => {
    const component_yml = `
      .frontend_interface: &frontend_interface_ref
        frontend: \${{ services['stateless-app'].interfaces.main.url }}
      name: test/component
      services:
        stateless-app:
          interfaces:
            main: 8080
      interfaces: *frontend_interface_ref
      `
    const environment_yml = `
      .frontend_interface: &frontend_interface_ref
        frontend: \${{ components.test/component.interfaces.frontend.url }}
      interfaces: *frontend_interface_ref
      components:
        test/component: file:./architect.yml
      `
    mock_fs({
      '/architect.yml': component_yml,
      '/environment.yml': environment_yml
    });

    const component_config = await ComponentConfigBuilder.buildFromPath('/architect.yml');
    expect(component_config).to.deep.eq({
      "name": "test/component",
      "services": {
        "stateless-app": {
          "interfaces": {
            "main": 8080
          }
        }
      },
      "interfaces": {
        "frontend": "${{ services['stateless-app'].interfaces.main.url }}"
      }
    })

    const env_config = await EnvironmentConfigBuilder.buildFromPath('/environment.yml');
    expect(env_config).to.deep.eq({
      "interfaces": {
        "frontend": "${{ components.test/component.interfaces.frontend.url }}"
      },
      "components": {
        "test/component": {
          "extends": `file:${path.resolve('/architect.yml')}`,
          "name": "test/component"
        }
      }
    })
  });
});
