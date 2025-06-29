export enum EQRCodeHandlerType {
  UNKNOWN = 'UNKNOWN',
  BITCOIN = 'BITCOIN',
  ETHEREUM = 'ETHEREUM',
  SOLANA = 'SOLANA',
  SUI = 'SUI',
  LIGHTNING_NETWORK = 'LIGHTNING_NETWORK',
  URL = 'URL',
  WALLET_CONNECT = 'WALLET_CONNECT',
  MIGRATE = 'MIGRATE',
  ANIMATION_CODE = 'ANIMATION_CODE',
  DEEPLINK = 'DEEPLINK',
  URL_ACCOUNT = 'URL_ACCOUNT',
  MARKET_DETAIL = 'MARKET_DETAIL',
  SEND_PROTECTION = 'SEND_PROTECTION',
  TOKEN_URI = 'TOKEN_URI',
}

export enum EQRCodeHandlerNames {
  bitcoin = 'bitcoin',
  ethereum = 'ethereum',
  solana = 'solana',
  walletconnect = 'walletconnect',
  migrate = 'migrate',
  animation = 'animation',
  urlAccount = 'urlAccount',
  marketDetail = 'marketDetail',
  sendProtection = 'sendProtection',
  sui = 'sui',
}

export const PARSE_HANDLER_NAMES = {
  all: [
    EQRCodeHandlerNames.bitcoin,
    EQRCodeHandlerNames.ethereum,
    EQRCodeHandlerNames.solana,
    EQRCodeHandlerNames.walletconnect,
    EQRCodeHandlerNames.migrate,
    EQRCodeHandlerNames.animation,
    EQRCodeHandlerNames.urlAccount,
    EQRCodeHandlerNames.marketDetail,
    EQRCodeHandlerNames.sendProtection,
    EQRCodeHandlerNames.sui,
  ],
  animation: [EQRCodeHandlerNames.animation],
  none: [],
} as Record<string, EQRCodeHandlerNames[]>;
