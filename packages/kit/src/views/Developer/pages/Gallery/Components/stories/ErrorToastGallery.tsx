import { Button, Stack } from '@onekeyhq/components';
import backgroundApiProxy from '@onekeyhq/kit/src/background/instance/backgroundApiProxy';
import {
  BadAuthError,
  InvoiceExpiredError,
  OneKeyError,
} from '@onekeyhq/shared/src/errors';
import errorToastUtils from '@onekeyhq/shared/src/errors/utils/errorToastUtils';
import {
  EAppEventBusNames,
  appEventBus,
} from '@onekeyhq/shared/src/eventBus/appEventBus';
import timerUtils from '@onekeyhq/shared/src/utils/timerUtils';

import { Layout } from './utils/Layout';

function error10() {
  throw new BadAuthError();
}
function error00() {
  throw new Error(`原生 new Error 不显示 toast: ${Date.now()}`);
}
function error11() {
  throw new BadAuthError({
    autoToast: true,
  });
}
function error13() {
  throw new OneKeyError({
    autoToast: true,
    message: '使用基类 new OneKeyError + autoToast 显示 toast',
  });
}
function error12() {
  throw new BadAuthError({
    autoToast: true,
    message: '自定义 Error 类，显式传入自定义 message，不再使用内置 i18n',
  });
  // throw new Error(`demoErrorInSyncMethod: ${Date.now()}`);
}

async function error20() {
  await timerUtils.wait(1000);
  throw new InvoiceExpiredError({
    autoToast: true,
  });
}

type IError21Result = {
  hello: 'world';
};
async function error21(): Promise<IError21Result> {
  throw new InvoiceExpiredError({
    autoToast: true,
  });
}

function Demo1() {
  return (
    <Stack gap="$2">
      <Button
        onPress={() => {
          error00();
        }}
      >
        不显示 toast1
      </Button>
      <Button
        onPress={() => {
          error10();
        }}
      >
        不显示 toast2
      </Button>
      <Button
        onPress={() => {
          error13();
        }}
      >
        显示 toast
      </Button>
      <Button
        onPress={() => {
          error11();
        }}
      >
        显示 toast2
      </Button>
      <Button
        onPress={() => {
          error12();
        }}
      >
        显示 toast 自定义 message
      </Button>
      <Button
        onPress={async () => {
          await error20();
        }}
      >
        异步函数显示 toast （1s 后）
      </Button>
      <Button
        onPress={async () => {
          const r: IError21Result = await error21();
          console.log(r);
        }}
      >
        异步函数显示 toast (globalListener)
      </Button>
      <Button
        onPress={async () => {
          const r: IError21Result = await errorToastUtils.withErrorAutoToast(
            () => error21(),
          );
          console.log(r);
        }}
      >
        异步函数显示 toast (withErrorAutoToast)
      </Button>
      <Button
        onPress={async () => {
          const ctx = await backgroundApiProxy.serviceDemo.demoError();
          console.log(ctx);
        }}
      >
        调用 background 显示 toast
      </Button>

      <Button
        onPress={async () => {
          const ctx = await backgroundApiProxy.serviceDemo.demoError2();
          console.log(ctx);
        }}
      >
        调用 background 不显示 toast2
      </Button>

      <Button
        onPress={async () => {
          try {
            const ctx = await backgroundApiProxy.serviceDemo.demoError3();
            console.log(ctx);
          } catch (error) {
            console.log('调用 background 显示 toast3', error);
            throw error;
          }
        }}
      >
        调用 background 显示 toast3
      </Button>

      <Button
        onPress={async () => {
          try {
            const ctx = await backgroundApiProxy.serviceDemo.demoError4();
            console.log(ctx);
          } catch (error) {
            console.log('调用 background 显示 toast3', error);
            throw error;
          }
        }}
      >
        调用 background 显示 toast4
      </Button>

      <Button
        onPress={async () => {
          appEventBus.emit(EAppEventBusNames.ShowToast, {
            method: 'error',
            title:
              'Hello World, Hello World, Hello World, Hello World, Hello World, Hello World, Hello World, Hello World, Hello World, Hello World, Hello World, 444444444444444444444444',
            message: '33333333-33333333-33333333-33333333',
          });
        }}
      >
        调用 appEventBus 显示 toast1
      </Button>

      <Button
        onPress={async () => {
          const ctx = await backgroundApiProxy.serviceDemo.demoError5();
          console.log(ctx);
        }}
      >
        调用 background 不显示 toast5
      </Button>
      <Button
        onPress={async () => {
          const ctx = await backgroundApiProxy.serviceDemo.demoErrorWithUrl();
          console.log(ctx);
        }}
      >
        调用 background 显示 url
      </Button>
      <Button
        onPress={async () => {
          const ctx = await backgroundApiProxy.serviceDemo.demoError6();
          console.log(ctx);
        }}
      >
        调用 background 显示 IncorrectPassword
      </Button>
    </Stack>
  );
}

const ErrorToastGallery = () => (
  <Layout
    componentName="ErrorToast"
    elements={[
      {
        title: 'ErrorToast',
        element: (
          <Stack gap="$1">
            <Demo1 />
          </Stack>
        ),
      },
    ]}
  />
);

export default ErrorToastGallery;
