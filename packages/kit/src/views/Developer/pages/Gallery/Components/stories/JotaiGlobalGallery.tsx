import { Button, SizableText, Stack } from '@onekeyhq/components';
import backgroundApiProxy from '@onekeyhq/kit/src/background/instance/backgroundApiProxy';
import {
  demoPriceAtom,
  demoReadOnlyAtom,
  demoWriteOnlyAtom,
  useDemoPriceAtom,
  useDemoReadOnlyAtom,
  useDemoReadWriteAtom,
  useDemoWriteOnlyAtom,
  useSettingsPersistAtom,
} from '@onekeyhq/kit-bg/src/states/jotai/atoms';
import { JOTAI_RESET } from '@onekeyhq/kit-bg/src/states/jotai/types';

import { Layout } from './utils/Layout';

void (async () => {
  const r = await demoPriceAtom.get();
  console.log('demoPriceAtom.get() > ', r);
})();

void (async () => {
  const r = await demoReadOnlyAtom.get();
  console.log('demoReadOnlyAtom.get() > ', r);
})();

function JotaiDemo1() {
  const [a, setA] = useDemoPriceAtom();
  const [b] = useDemoReadOnlyAtom();
  const [, w] = useDemoWriteOnlyAtom();
  const [c, rw] = useDemoReadWriteAtom();
  console.log('useDemoReadOnlyAtom > ', { a, b, c });
  return (
    <Stack gap="$2">
      <Button
        onPress={() => {
          setA(JOTAI_RESET);
        }}
      >
        reset
      </Button>
      <Button
        onPress={() => {
          console.log('1');
          w({ discount: 0.5 });
        }}
      >
        WriteOnly set discount 0.5: {a} - {b} - {c}
      </Button>
      <Button
        onPress={() => {
          rw(10);
        }}
      >
        ReadWriteAtom set 10
      </Button>
      <Button
        onPress={async () => {
          const v = await demoPriceAtom.get();
          console.log(v);
          console.log(await demoPriceAtom.ready());
        }}
      >
        get state: {a}
      </Button>
      <Button
        onPress={() => {
          const vv = 10;
          const v = demoPriceAtom.set(vv);
          console.log(v);
        }}
      >
        demoPriceAtom set 10: {a}
      </Button>
      <Button
        onPress={async () => {
          // await demoReadWriteAtom.set(10);
          await demoWriteOnlyAtom.set({ discount: 0.3 });
        }}
      >
        WriteOnly set discount 0.3: {a}
      </Button>
    </Stack>
  );
}

function JotaiDemo2() {
  const [settings, setSettings] = useSettingsPersistAtom();
  return (
    <Stack gap="$2">
      <SizableText size="$headingMd">高频数据分离</SizableText>
      <SizableText size="$headingMd">
        低频数据整体打包，避免定义数据太零碎
      </SizableText>
      <SizableText>theme={settings.theme}</SizableText>
      <SizableText>locale={settings.locale}</SizableText>
      <SizableText>{settings.instanceId}</SizableText>
      <SizableText size="$headingMd">UI 层修改数据</SizableText>
      <SizableText>
        UI 层通常不直接写数据，而是通过 background 的 service
        方法进行写数据，除非特别简单的场景可以在 UI 直接调用
      </SizableText>
      <Button
        onPress={() =>
          setSettings((v) => ({
            ...v,
            theme: v.theme !== 'dark' ? 'dark' : 'light',
          }))
        }
      >
        修改 theme
      </Button>
      <Button
        onPress={() =>
          setSettings((v) => ({
            ...v,
            locale: v.locale !== 'zh-CN' ? 'zh-CN' : 'en-US',
          }))
        }
      >
        修改 locale
      </Button>
      <SizableText size="$headingMd">
        响应式的计算数据（只读，globalAtomComputed）
      </SizableText>
      <SizableText>
        计算数据的写入函数 globalAtomComputedW 和 globalAtomComputedRW
        不考虑使用，而是通过 background 的 service 方法进行写数据
      </SizableText>
      <SizableText size="$headingMd">background 获取数据</SizableText>
      <Button
        onPress={async () => {
          const r = await backgroundApiProxy.serviceDemo.demoJotaiGetSettings();
          console.log(
            'backgroundApiProxy.serviceDemo.demoJotaiGetSettings: ',
            r,
          );
        }}
      >
        show settings
      </Button>
      <SizableText size="$headingMd">background 更新数据</SizableText>
      <Button
        onPress={async () => {
          const r =
            await backgroundApiProxy.serviceDemo.demoJotaiUpdateSettings();
          console.log(
            'backgroundApiProxy.serviceDemo.demoJotaiUpdateSettings: ',
            r,
          );
        }}
      >
        update settings
      </Button>
    </Stack>
  );
}

const JotaiGlobalGallery = () => (
  <Layout
    componentName="JotaiGlobal"
    elements={[
      {
        title: 'DemoAtom',
        element: (
          <Stack gap="$1">
            <JotaiDemo1 />
          </Stack>
        ),
      },
      {
        title: 'settingsPersistAtom',
        element: (
          <Stack gap="$1">
            <JotaiDemo2 />
          </Stack>
        ),
      },
    ]}
  />
);

export default JotaiGlobalGallery;
