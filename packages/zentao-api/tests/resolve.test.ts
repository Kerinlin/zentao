import { afterEach, describe, expect, test } from 'bun:test';
import {
  defineModules,
  getModule,
  type ModuleAction,
  type ModuleDefinition,
} from '../src/index';
import { resetModuleDefinitions } from '../src/modules/registry';
import { extractPager, extractResult, resolveActionRequest } from '../src/modules/resolve';

afterEach(() => {
  resetModuleDefinitions();
});

describe('resolveActionRequest', () => {
  test('resolves scoped list paths by execution, project, then product priority', () => {
    defineModules({
      name: 'workitem',
      actions: [
        {
          name: 'list',
          type: 'list',
          method: 'get',
          path: '/{scope}/{scopeID}/workitems',
          pathParams: {
            scope: {
              description: 'Scope',
              options: [
                { value: 'products', label: 'Product' },
                { value: 'projects', label: 'Project' },
                { value: 'executions', label: 'Execution' },
              ],
            },
            scopeID: 'Scope ID',
          },
          params: [
            {
              name: 'pageID',
              required: false,
              type: 'number',
              description: 'Page',
            },
            {
              name: 'status',
              required: false,
              type: 'string',
              description: 'Status',
              options: [{ value: 'open', label: 'Open' }],
            },
          ],
          resultType: 'list',
        },
      ],
    });

    const command = resolveActionRequest(getModule('workitem')!, 'list', {
      productID: 1,
      projectID: '2',
      executionID: '3',
      page: '4',
    });

    expect(command.path).toBe('/executions/3/workitems');
    expect(command.query).toEqual({
      pageID: '4',
      status: 'open',
    });
  });

  test('resolves scoped list paths from explicit scope and scopeID', () => {
    defineModules({
      name: 'workitem',
      actions: [
        {
          name: 'list',
          type: 'list',
          method: 'get',
          path: '/{scope}/{scopeID}/workitems',
          pathParams: {
            scope: {
              description: 'Scope',
              options: [
                { value: 'products', label: 'Product' },
                { value: 'projects', label: 'Project' },
                { value: 'executions', label: 'Execution' },
              ],
            },
            scopeID: 'Scope ID',
          },
          resultType: 'list',
        },
      ],
    });

    const command = resolveActionRequest(getModule('workitem')!, 'list', {
      scope: 'products',
      scopeID: 1,
    });

    expect(command.path).toBe('/products/1/workitems');
  });

  test('prefers explicit scope/scopeID over product/project/execution aliases', () => {
    defineModules({
      name: 'workitem',
      actions: [
        {
          name: 'list',
          type: 'list',
          method: 'get',
          path: '/{scope}/{scopeID}/workitems',
          pathParams: {
            scope: {
              description: 'Scope',
              options: [
                { value: 'products', label: 'Product' },
                { value: 'projects', label: 'Project' },
                { value: 'executions', label: 'Execution' },
              ],
            },
            scopeID: 'Scope ID',
          },
          resultType: 'list',
        },
      ],
    });

    const command = resolveActionRequest(getModule('workitem')!, 'list', {
      scope: 'products',
      scopeID: 1,
      executionID: 9,
    });

    expect(command.path).toBe('/products/1/workitems');
  });

  test('falls back to aliases when only one of scope/scopeID is provided', () => {
    defineModules({
      name: 'workitem',
      actions: [
        {
          name: 'list',
          type: 'list',
          method: 'get',
          path: '/{scope}/{scopeID}/workitems',
          pathParams: {
            scope: {
              description: 'Scope',
              options: [
                { value: 'products', label: 'Product' },
                { value: 'projects', label: 'Project' },
                { value: 'executions', label: 'Execution' },
              ],
            },
            scopeID: 'Scope ID',
          },
          resultType: 'list',
        },
      ],
    });

    const command = resolveActionRequest(getModule('workitem')!, 'list', {
      scope: 'products',
      productID: 7,
    });

    expect(command.path).toBe('/products/7/workitems');
  });

  test('throws E_INVALID_PARAM for an unrecognized scope value', () => {
    defineModules({
      name: 'workitem',
      actions: [
        {
          name: 'list',
          type: 'list',
          method: 'get',
          path: '/{scope}/{scopeID}/workitems',
          pathParams: {
            scope: {
              description: 'Scope',
              options: [
                { value: 'products', label: 'Product' },
                { value: 'projects', label: 'Project' },
                { value: 'executions', label: 'Execution' },
              ],
            },
            scopeID: 'Scope ID',
          },
          resultType: 'list',
        },
      ],
    });

    expect(() => resolveActionRequest(getModule('workitem')!, 'list', {
      scope: 'product',
      scopeID: 1,
    })).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAM' }));
  });

  test('uses path param defaults and id aliases when building paths', () => {
    defineModules({
      name: 'widget',
      actions: [
        {
          name: 'transition',
          type: 'action',
          method: 'put',
          path: '/widgets/{mode}/{widgetID}',
          pathParams: {
            mode: {
              description: 'Mode',
              defaultValue: 'archive',
            },
            widgetID: 'Widget ID',
          },
          resultType: 'text',
        },
      ],
    });

    const command = resolveActionRequest(getModule('widget')!, 'transition', { id: '42' });

    expect(command.path).toBe('/widgets/archive/42');
    expect(command.id).toBe(42);
  });

  test('builds request body from data, flat params, defaults, and schema types', () => {
    const formModule: ModuleDefinition = {
      name: 'form',
      actions: [
        {
          name: 'create',
          type: 'create',
          method: 'post',
          path: '/forms',
          resultType: 'object',
          requestBody: {
            type: 'object',
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
                estimate: { type: 'integer' },
                enabled: { type: 'boolean' },
                tags: { type: 'array', items: { type: 'string' } },
                priority: { type: 'number', defaultValue: '2' },
              },
            },
          },
        },
      ],
    };
    defineModules(formModule);

    const command = resolveActionRequest(getModule('form')!, 'create', {
      data: '{"name":"from data","estimate":"8"}',
      enabled: 'false',
      tags: 'api,sdk',
    });

    expect(command.data).toEqual({
      name: 'from data',
      estimate: 8,
      enabled: false,
      tags: ['api', 'sdk'],
      priority: 2,
    });
  });

  test('accepts product alias for required productID and dual-writes both fields', () => {
    defineModules({
      name: 'bugform',
      actions: [
        {
          name: 'create',
          type: 'create',
          method: 'post',
          path: '/bugs',
          resultType: 'object',
          requestBody: {
            type: 'object',
            schema: {
              type: 'object',
              required: ['productID', 'title', 'openedBuild'],
              properties: {
                productID: { type: 'integer', description: '所属产品' },
                title: { type: 'string' },
                openedBuild: { type: 'array', items: { type: 'string' } },
                project: { type: 'integer' },
              },
            },
          },
        },
      ],
    });

    // CLI / 工作区注入的是短名 product，schema 必填 productID
    const fromShort = resolveActionRequest(getModule('bugform')!, 'create', {
      product: '189',
      project: 1278,
      title: 'from product alias',
      openedBuild: 'trunk',
    });
    expect(fromShort.data).toEqual({
      productID: 189,
      product: 189,
      title: 'from product alias',
      openedBuild: ['trunk'],
      project: 1278,
      projectID: 1278,
    });

    // 仅传 productID 时，body 仍双写 product（禅道 PHP 读短名）
    const fromLong = resolveActionRequest(getModule('bugform')!, 'create', {
      productID: 189,
      title: 'from productID',
      openedBuild: ['trunk'],
    });
    expect(fromLong.data).toEqual({
      productID: 189,
      product: 189,
      title: 'from productID',
      openedBuild: ['trunk'],
    });
  });

  test('coerces common boolean string values without treating every non-empty string as true', () => {
    defineModules({
      name: 'flagform',
      actions: [
        {
          name: 'create',
          type: 'create',
          method: 'post',
          path: '/flag-forms',
          resultType: 'object',
          requestBody: {
            type: 'object',
            schema: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                archived: { type: 'boolean' },
                visible: { type: 'boolean' },
              },
            },
          },
        },
      ],
    });

    const command = resolveActionRequest(getModule('flagform')!, 'create', {
      enabled: '0',
      archived: 'off',
      visible: '1',
    });

    expect(command.data).toEqual({
      enabled: false,
      archived: false,
      visible: true,
    });
  });

  test('throws E_INVALID_PARAM when a boolean field receives an unrecognized string', () => {
    defineModules({
      name: 'strictflagform',
      actions: [
        {
          name: 'create',
          type: 'create',
          method: 'post',
          path: '/strict-flag-forms',
          resultType: 'object',
          requestBody: {
            type: 'object',
            schema: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
              },
            },
          },
        },
      ],
    });

    expect(() => resolveActionRequest(getModule('strictflagform')!, 'create', {
      enabled: 'maybe',
    })).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAM' }));
  });

  test('preserves explicit object values from data for array schema fields', () => {
    defineModules({
      name: 'iteration',
      actions: [
        {
          name: 'create',
          type: 'create',
          method: 'post',
          path: '/iterations',
          resultType: 'object',
          requestBody: {
            type: 'object',
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
                plans: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      ],
    });

    const command = resolveActionRequest(getModule('iteration')!, 'create', {
      data: {
        name: 'iteration 1',
        plans: { '1': [2] },
      },
    });

    expect(command.data).toEqual({
      name: 'iteration 1',
      plans: { '1': [2] },
    });
  });

  test('preserves explicit null values from data and flat params', () => {
    defineModules({
      name: 'nullableform',
      actions: [
        {
          name: 'update',
          type: 'update',
          method: 'put',
          path: '/nullable-forms/{nullableformID}',
          pathParams: { nullableformID: 'Nullable form ID' },
          resultType: 'object',
          requestBody: {
            type: 'object',
            schema: {
              type: 'object',
              properties: {
                title: { type: 'string', defaultValue: 'default title' },
                estimate: { type: 'integer', defaultValue: 3 },
                reviewers: { type: 'array' },
              },
            },
          },
        },
      ],
    });

    const command = resolveActionRequest(getModule('nullableform')!, 'update', {
      id: 1,
      data: {
        title: null,
        reviewers: null,
      },
      estimate: null,
    });

    expect(command.data).toEqual({
      title: null,
      estimate: null,
      reviewers: null,
    });
  });

  test('update body keeps non-schema writable fields from flat params', () => {
    defineModules({
      name: 'partialform',
      actions: [
        {
          name: 'update',
          type: 'update',
          method: 'put',
          path: '/partial-forms/{partialformID}',
          pathParams: { partialformID: 'Partial form ID' },
          resultType: 'object',
          requestBody: {
            type: 'object',
            schema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
              },
            },
          },
        },
      ],
    });

    const command = resolveActionRequest(getModule('partialform')!, 'update', {
      id: 9,
      partialformID: 9,
      title: 'only title changed',
      mailto: 'a,b',
      assignedTo: 'admin',
    });

    expect(command.data).toEqual({
      title: 'only title changed',
      mailto: 'a,b',
      assignedTo: 'admin',
    });
    expect(command.data).not.toHaveProperty('id');
    expect(command.data).not.toHaveProperty('partialformID');
  });

  test('create body still drops non-schema flat params', () => {
    defineModules({
      name: 'strictcreate',
      actions: [
        {
          name: 'create',
          type: 'create',
          method: 'post',
          path: '/strict-creates',
          resultType: 'object',
          requestBody: {
            type: 'object',
            schema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
              },
            },
          },
        },
      ],
    });

    const command = resolveActionRequest(getModule('strictcreate')!, 'create', {
      title: 'new',
      mailto: 'should-not-appear',
    });

    expect(command.data).toEqual({ title: 'new' });
    expect(command.data).not.toHaveProperty('mailto');
  });

  test('throws when required request body fields are missing', () => {
    defineModules({
      name: 'requiredform',
      actions: [
        {
          name: 'create',
          type: 'create',
          method: 'post',
          path: '/required-forms',
          resultType: 'object',
          requestBody: {
            type: 'object',
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
              },
            },
          },
        },
      ],
    });

    expect(() => resolveActionRequest(getModule('requiredform')!, 'create', {})).toThrow('name');
  });
});

describe('result and pager extraction', () => {
  test('extracts mapped result fields and mapped pager fields', () => {
    const action: ModuleAction = {
      name: 'summary',
      type: 'get',
      method: 'get',
      path: '/summary',
      resultType: 'object',
      resultGetter: {
        count: 'total',
        rows: 'items',
      },
      pagerGetter: {
        pageID: 'page',
        recPerPage: 'size',
        recTotal: 'total',
      },
    };
    const response = {
      total: 2,
      page: 3,
      size: 20,
      items: [{ id: 1 }, { id: 2 }],
    };

    expect(extractResult(action, response)).toEqual({
      count: 2,
      rows: [{ id: 1 }, { id: 2 }],
    });
    expect(extractPager(action, response)).toEqual({
      pageID: 3,
      recPerPage: 20,
      recTotal: 2,
    });
  });

  test('supports function result and pager getters', () => {
    const action: ModuleAction = {
      name: 'computed',
      type: 'get',
      method: 'get',
      path: '/computed',
      resultType: 'object',
      resultGetter: (data) => ({ title: (data as { title: string }).title.toUpperCase() }),
      pagerGetter: () => ({
        pageID: 1,
        recPerPage: 10,
        recTotal: 1,
      }),
    };

    expect(extractResult(action, { title: 'zentao' })).toEqual({ title: 'ZENTAO' });
    expect(extractPager(action, {})).toEqual({
      pageID: 1,
      recPerPage: 10,
      recTotal: 1,
    });
  });

  test('passes call params to function getters', () => {
    const action: ModuleAction = {
      name: 'computed',
      type: 'get',
      method: 'get',
      path: '/computed',
      resultType: 'object',
      resultGetter: (_data, params) => ({ echoed: params.id }),
      pagerGetter: (_data, params) => ({
        pageID: Number(params.page),
        recPerPage: 10,
        recTotal: 0,
      }),
    };

    expect(extractResult(action, {}, { id: 42 })).toEqual({ echoed: 42 });
    expect(extractPager(action, {}, { page: 3 })).toEqual({
      pageID: 3,
      recPerPage: 10,
      recTotal: 0,
    });
  });

  test('extracts mapped result and pager fields from nested paths', () => {
    const action: ModuleAction = {
      name: 'summary',
      type: 'get',
      method: 'get',
      path: '/summary',
      resultType: 'object',
      resultGetter: {
        rows: 'data.items',
      },
      pagerGetter: {
        pageID: 'data.page',
        recPerPage: 'data.size',
        recTotal: 'data.total',
      },
    };
    const response = {
      data: {
        page: 3,
        size: 20,
        total: 2,
        items: [{ id: 1 }, { id: 2 }],
      },
    };

    expect(extractResult(action, response)).toEqual({
      rows: [{ id: 1 }, { id: 2 }],
    });
    expect(extractPager(action, response)).toEqual({
      pageID: 3,
      recPerPage: 20,
      recTotal: 2,
    });
  });
});
