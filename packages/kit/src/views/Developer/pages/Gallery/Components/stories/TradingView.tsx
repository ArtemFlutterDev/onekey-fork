import { TradingView } from '@onekeyhq/kit/src/components/TradingView';

import { Layout } from './utils/Layout';

const TradingViewGallery = () => (
  <Layout
    componentName="TradingView"
    elements={[
      {
        title: '默认状态',
        element: (
          <TradingView
            mode="realtime"
            baseToken="BTC"
            targetToken="USDT"
            identifier="binance"
            h={400}
            w="100%"
            onLoadEnd={() => console.log('onLoadEnd')}
          />
        ),
      },
    ]}
  />
);

export default TradingViewGallery;
