import crypto from 'crypto';

import { sha256 as _sha256 } from '@noble/hashes/sha256';
import {
  address as BitcoinJsAddress,
  Transaction as BitcoinJsTransaction,
  Psbt,
  payments,
} from 'bitcoinjs-lib';
import bitcoinMessage from 'bitcoinjs-message';
import bs58check from 'bs58check';
import { encode as VaruintBitCoinEncode } from 'varuint-bitcoin';

import { presetNetworksMap } from '@onekeyhq/shared/src/config/presetNetworks';
import { BTC_FIRST_TAPROOT_PATH } from '@onekeyhq/shared/src/consts/chainConsts';
import { IMPL_TBTC } from '@onekeyhq/shared/src/engine/engineConsts';
import {
  AddressNotSupportSignMethodError,
  OneKeyInternalError,
} from '@onekeyhq/shared/src/errors';
import { defaultLogger } from '@onekeyhq/shared/src/logger/logger';
import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';
import { checkIsDefined } from '@onekeyhq/shared/src/utils/assertUtils';
import bufferUtils from '@onekeyhq/shared/src/utils/bufferUtils';
import numberUtils from '@onekeyhq/shared/src/utils/numberUtils';
import type { IServerNetwork } from '@onekeyhq/shared/types';
import type {
  IXprvtValidation,
  IXpubValidation,
} from '@onekeyhq/shared/types/address';
import { EMessageTypesBtc } from '@onekeyhq/shared/types/message';

import { CoreChainApiBase } from '../../base/CoreChainApiBase';
import {
  BaseBip32KeyDeriver,
  batchGetPublicKeysAsync,
  decryptAsync,
  encryptAsync,
  mnemonicFromEntropyAsync,
  mnemonicToSeedAsync,
  secp256k1,
  verify,
} from '../../secret';
import { EAddressEncodings, ECoreApiExportedSecretKeyType } from '../../types';
import { slicePathTemplate } from '../../utils';

import {
  btcForkVersionBytesToBuffer,
  buildBtcXpubSegwitAsync,
  getAddressFromXpub,
  getBitcoinBip32,
  getBitcoinECPair,
  getBtcForkNetwork,
  getBtcForkVersionBytesByAddressEncoding,
  getBtcXpubFromXprvt,
  getInputsToSignFromPsbt,
  getPublicKeyFromXpub,
  initBitcoinEcc,
  tweakSigner,
  validateBtcAddress,
  validateBtcXprvt,
  validateBtcXpub,
} from './sdkBtc';
import { isTaprootInput } from './sdkBtc/bip371';
import { buildPsbt } from './sdkBtc/providerUtils';

import type { IGetAddressFromXpubResult } from './sdkBtc';
import type { IBtcForkNetwork, IEncodedTxBtc } from './types';
import type { ISigner } from '../../base/ChainSigner';
import type { IBip32ExtendedKey, IBip32KeyDeriver } from '../../secret';
import type {
  ICoreApiGetAddressItem,
  ICoreApiGetAddressQueryImportedBtc,
  ICoreApiGetAddressQueryPublicKey,
  ICoreApiGetAddressesQueryHdBtc,
  ICoreApiGetAddressesResult,
  ICoreApiGetExportedSecretKey,
  ICoreApiPrivateKeysMap,
  ICoreApiSignAccount,
  ICoreApiSignBasePayload,
  ICoreApiSignMsgPayload,
  ICoreApiSignTxPayload,
  ICoreApiValidateXprvtParams,
  ICoreApiValidateXpubParams,
  ICurveName,
  IEncodedTx,
  ISignedTxPro,
  ITxInputToSign,
  IUnsignedMessageBtc,
} from '../../types';
import type { PsbtInput } from 'bip174';
import type { Signer, networks } from 'bitcoinjs-lib';

const curveName: ICurveName = 'secp256k1';
// const a  = tweakSigner()

const validator = (
  pubkey: Uint8Array,
  msghash: Uint8Array,
  signature: Uint8Array,
): boolean => {
  const pubkeyBuffer = Buffer.from(pubkey);
  const msghashBuffer = Buffer.from(msghash);
  const signatureBuffer = Buffer.from(signature);

  return verify(curveName, pubkeyBuffer, msghashBuffer, signatureBuffer);
};

export function sha256(buffer: Buffer): Buffer {
  return Buffer.from(_sha256(Uint8Array.from(buffer)));
}

const bip0322Hash = (message: string) => {
  const tag = 'BIP0322-signed-message';
  const tagHash = sha256(Buffer.from(tag));
  const result = sha256(
    Buffer.concat([tagHash, tagHash, Buffer.from(message)]),
  );
  return result.toString('hex');
};

const encodeVarString = (buffer: Buffer) => {
  const lengthBytes = VaruintBitCoinEncode(buffer.byteLength);
  return Buffer.concat([Buffer.from(lengthBytes.buffer), buffer]);
};

export default class CoreChainSoftwareBtc extends CoreChainApiBase {
  async getCoinName({ network }: { network: IServerNetwork }) {
    return Promise.resolve(network.isTestnet ? 'TEST' : 'BTC');
  }

  async getXpubRegex({
    btcForkNetwork,
  }: {
    btcForkNetwork: IBtcForkNetwork;
  }): Promise<string> {
    if (btcForkNetwork.networkChainCode === presetNetworksMap.btc.code) {
      return '^[xyz]pub';
    }
    if (
      btcForkNetwork.networkChainCode === presetNetworksMap.tbtc.code ||
      btcForkNetwork.networkChainCode === presetNetworksMap.sbtc.code
    ) {
      return '^[tuv]pub';
    }
    // Other fork chains do not verify the regular expression
    return '';
  }

  async getXprvtRegex({
    btcForkNetwork,
  }: {
    btcForkNetwork: IBtcForkNetwork;
  }): Promise<string> {
    if (btcForkNetwork.networkChainCode === presetNetworksMap.btc.code) {
      return '^[xyz]prv';
    }
    if (
      btcForkNetwork.networkChainCode === presetNetworksMap.tbtc.code ||
      btcForkNetwork.networkChainCode === presetNetworksMap.sbtc.code
    ) {
      return '^[tuv]prv';
    }
    // Other fork chains do not verify the regular expression
    return '';
  }

  override async validateXprvt(
    params: ICoreApiValidateXprvtParams,
  ): Promise<IXprvtValidation> {
    const { xprvt, btcForkNetwork } = params;
    return Promise.resolve(
      validateBtcXprvt({
        xprvt,
        regex: await this.getXprvtRegex({ btcForkNetwork }),
      }),
    );
  }

  override async validateXpub(
    params: ICoreApiValidateXpubParams,
  ): Promise<IXpubValidation> {
    const { xpub, btcForkNetwork } = params;
    return Promise.resolve(
      validateBtcXpub({
        xpub,
        regex: await this.getXpubRegex({ btcForkNetwork }),
      }),
    );
  }

  protected decodeAddress(address: string): string {
    return address;
  }

  protected encodeAddress(address: string): string {
    return address;
  }

  public getPsbt({ network }: { network: IBtcForkNetwork }): Psbt {
    return new Psbt({ network });
  }

  override async getExportedSecretKey(
    query: ICoreApiGetExportedSecretKey,
  ): Promise<string> {
    const {
      account,
      keyType,
      addressEncoding,

      networkInfo,
      password,
      credentials,
    } = query;
    console.log(
      'ExportSecretKeys >>>> btc',
      this.baseGetCredentialsType({ credentials }),
    );
    const { privateKeyRaw } = await this.baseGetDefaultPrivateKey(query);

    if (!privateKeyRaw) {
      throw new Error('privateKeyRaw is required');
    }

    if (keyType === ECoreApiExportedSecretKeyType.xprvt) {
      if (credentials.hd) {
        if (!addressEncoding) {
          throw new Error('addressEncoding is required');
        }
        if (!account.xpub) {
          throw new Error('xpub is required');
        }
        const network = getBtcForkNetwork(networkInfo?.networkChainCode);

        const versionByte = getBtcForkVersionBytesByAddressEncoding({
          addressEncoding,
          btcForkNetwork: network,
        });

        const xprvVersionBytes = versionByte.private;
        if (!xprvVersionBytes) {
          throw new Error('xprvVersionBytes not found');
        }
        return bs58check.encode(
          Buffer.from(bs58check.decode(account.xpub))
            .fill(
              btcForkVersionBytesToBuffer({ versionBytes: xprvVersionBytes }),
              0,
              4,
            )
            .fill(
              Buffer.concat([
                Buffer.from([0]),
                await decryptAsync({ password, data: privateKeyRaw }),
              ]),
              45,
              78,
            ),
        );
      }
      if (credentials.imported) {
        return bs58check.encode(
          await decryptAsync({ password, data: privateKeyRaw }),
        );
      }
    }
    throw new Error(`SecretKey type not support: ${keyType}`);
  }

  override async getAddressFromPublic(
    query: ICoreApiGetAddressQueryPublicKey,
  ): Promise<ICoreApiGetAddressItem> {
    const { networkInfo, publicKey, addressEncoding } = query;
    const network = getBtcForkNetwork(networkInfo.networkChainCode);

    // 'BTC fork UTXO account should pass account xpub but not single address publicKey.',
    const xpub = publicKey;

    // only return first 0/0 relPath address for xpub account
    const firstRelPath = '0/0';
    const { addresses, xpubSegwit } = await this.getAddressFromXpub({
      network,
      xpub,
      relativePaths: [firstRelPath],
      addressEncoding,
    });
    return {
      address: addresses[firstRelPath],
      publicKey: '',
      xpub,
      xpubSegwit,
      addresses,
    };
  }

  // root fingerprint
  async buildXfpFromMnemonic({ mnemonic }: { mnemonic: string }) {
    const seed = await mnemonicToSeedAsync({ mnemonic });
    const bip32 = getBitcoinBip32();
    const root = bip32.fromSeed(seed, getBtcForkNetwork('btc'));

    // const child = root.deriveHardened(0);  // derive path m/0'
    const child = root;

    const pubkey = child.publicKey;

    const sha256Buf = crypto.createHash('sha256').update(pubkey).digest();
    const ripemd160Buf = crypto
      .createHash('ripemd160')
      .update(sha256Buf)
      .digest();

    // 4236794462
    const fingerprintBuf = ripemd160Buf.slice(0, 4);
    const fingerprintHex = bufferUtils.bytesToHex(fingerprintBuf);
    // const fingerprintInt = fingerprintBuf.readUInt32BE(0);
    const fingerprintInt = numberUtils.hexToDecimal(fingerprintHex);
    const fingerprintHexCheck = numberUtils.numberToHex(fingerprintInt);

    const taprootChild = root.derivePath(BTC_FIRST_TAPROOT_PATH);
    const firstTaprootXpub = taprootChild.neutered().toBase58();

    const fullXfp = accountUtils.buildFullXfp({
      xfp: fingerprintHex,
      firstTaprootXpub,
    });

    console.log('generateXfpFromMnemonic', {
      fulXfp: fullXfp,
      firstTaprootXpub,
      fingerprintHex,
      fingerprintInt,
      fingerprintHexCheck,
    });

    if (!fullXfp) {
      throw new Error('fulXfp build failed');
    }

    return {
      // xfp: fingerprintHex,
      fullXfp,
      firstTaprootXpub,
    };
  }

  // TODO memo and move to utils (file with getBtcForkNetwork)

  public async getAddressFromXpub({
    network,
    xpub,
    relativePaths,
    addressEncoding,
  }: {
    network: IBtcForkNetwork;
    xpub: string;
    relativePaths: Array<string>;
    addressEncoding?: EAddressEncodings;
  }): Promise<IGetAddressFromXpubResult> {
    return getAddressFromXpub({
      curve: curveName,
      network,
      xpub,
      relativePaths,
      addressEncoding,
      encodeAddress: this.encodeAddress.bind(this),
    });
  }

  private async buildSignersMap({
    payload,
  }: {
    payload: ICoreApiSignBasePayload;
  }): Promise<Partial<{ [address: string]: ISigner }>> {
    const { password } = payload;
    const privateKeys = await this.getPrivateKeysInFullPath({
      payload,
    });
    const pathToAddresses = payload?.btcExtraInfo?.pathToAddresses;
    const signers: { [address: string]: ISigner } = {};
    for (const [fullPath, privateKey] of Object.entries(privateKeys)) {
      const address = pathToAddresses?.[fullPath]?.address;
      if (!address) {
        throw new Error(
          'getSignersMap ERROR: address is required, is privateKeys including fullPath?',
        );
      }
      const signer = await this.buildSignerBtc({
        privateKey,
        password,
      });
      signers[address] = signer;
    }
    return signers;
  }

  private buildSignerBtc({
    privateKey,
    password,
  }: {
    privateKey: string; // encryptedPrivateKey by password
    password: string;
  }) {
    return this.baseCreateSigner({
      curve: curveName,
      privateKey,
      password,
    });
  }

  private async getBitcoinSignerPro({
    network,
    signer,
    input,
    disableTweakSigner,
    useTweakedSigner,
  }: {
    network: IBtcForkNetwork;
    signer: ISigner;
    input: PsbtInput;
    disableTweakSigner?: boolean;
    useTweakedSigner?: boolean;
  }): Promise<Signer> {
    const publicKey = await signer.getPubkey(true);

    // P2TR taproot
    if (isTaprootInput(input)) {
      let needTweak =
        typeof useTweakedSigner === 'boolean' ? useTweakedSigner : true;

      if (!disableTweakSigner) {
        // script path spend
        if (
          input.tapLeafScript &&
          input.tapLeafScript?.length > 0 &&
          !input.tapMerkleRoot
        ) {
          input.tapLeafScript.forEach((e) => {
            if (e.controlBlock && e.script) {
              needTweak = false;
            }
          });
        }
      } else {
        needTweak = false;
      }

      if (input.tapInternalKey) {
        const privateKey = await signer.getPrvkey();
        const tweakedSigner = tweakSigner(privateKey, publicKey, {
          network,
          needTweak,
        });
        return tweakedSigner;
      }
    }

    // For other encoding (other btc fork chain)
    return {
      publicKey,
      // @ts-expect-error
      sign: async (hash: Buffer) => {
        const [sig] = await signer.sign(hash);
        return sig;
      },
    };
  }

  private async packTransactionToPSBT({
    network,
    signers,
    payload,
  }: {
    network: IBtcForkNetwork;
    signers: Partial<{ [address: string]: ISigner }>;
    payload: ICoreApiSignTxPayload;
  }) {
    const { unsignedTx, btcExtraInfo } = payload;
    const psbt = await buildPsbt({
      network,
      unsignedTx,
      btcExtraInfo,
      getPsbt: (params) => this.getPsbt({ network: params.network }),
      buildInputMixinInfo: async ({ address }) => {
        const signer = this.pickSigner(signers, address);
        return Promise.resolve({ pubkey: await signer.getPubkey(true) });
      },
    });

    return psbt;
  }

  private async appendImportedRelPathPrivateKeys({
    privateKeys,
    password,
    relPaths,
  }: {
    privateKeys: ICoreApiPrivateKeysMap;
    password: string;
    relPaths?: string[];
  }): Promise<ICoreApiPrivateKeysMap> {
    const deriver = new BaseBip32KeyDeriver(
      Buffer.from('Bitcoin seed'),
      secp256k1,
    ) as IBip32KeyDeriver;

    // imported account return "" key as root privateKey
    const privateKey = privateKeys[''];
    const xprv: Buffer = await decryptAsync({
      password,
      data: bufferUtils.toBuffer(privateKey),
    });
    const startKey: {
      chainCode: Buffer;
      key: Buffer;
    } = {
      chainCode: xprv.slice(13, 45),
      key: xprv.slice(46, 78),
    };

    const cache: Record<string, IBip32ExtendedKey> = {};

    for (const relPath of relPaths ?? []) {
      const pathComponents = relPath.split('/');

      let currentPath = '';
      let parent = startKey;
      for (const pathComponent of pathComponents) {
        currentPath =
          currentPath.length > 0
            ? `${currentPath}/${pathComponent}`
            : pathComponent;
        if (typeof cache[currentPath] === 'undefined') {
          const index = pathComponent.endsWith("'")
            ? parseInt(pathComponent.slice(0, -1), 10) + 2 ** 31
            : parseInt(pathComponent, 10);
          const thisPrivKey = deriver.CKDPriv(parent, index);
          cache[currentPath] = thisPrivKey;
        }
        parent = cache[currentPath];
      }

      // TODO use dbAccountAddresses save fullPath/relPath key
      privateKeys[relPath] = bufferUtils.bytesToHex(
        await encryptAsync({ password, data: cache[relPath].key }),
      );
    }
    return privateKeys;
  }

  async getPrivateKeysInFullPath({
    payload,
  }: {
    payload: ICoreApiSignBasePayload;
  }): Promise<ICoreApiPrivateKeysMap> {
    const btcExtraInfo = checkIsDefined(payload.btcExtraInfo);
    // privateKeys in relPaths
    const privateKeys = await this.getPrivateKeys(payload);

    const isImported = !!payload.credentials.imported;

    const { pathToAddresses } = btcExtraInfo;
    const networkImpl = checkIsDefined(payload.networkInfo.networkImpl);

    const ret: ICoreApiPrivateKeysMap = {};

    for (const [fullPath, { address, relPath }] of Object.entries(
      pathToAddresses,
    )) {
      const privateKeyPath = isImported ? relPath : fullPath;
      let privateKey = privateKeys[privateKeyPath];

      // fix blockbook utxo path to match local account path
      if (networkImpl === IMPL_TBTC) {
        if (!privateKey) {
          const fixedPath = privateKeyPath.replace(`m/86'/0'/`, `m/86'/1'/`);
          privateKey = privateKeys[fixedPath];
        }
        if (!privateKey) {
          const fixedPath = privateKeyPath.replace(`m/86'/1'/`, `m/86'/0'/`);
          privateKey = privateKeys[fixedPath];
        }
      }

      // TODO generate address from privateKey, and check if matched with utxo address
      const addressFromPrivateKey = address;
      if (addressFromPrivateKey !== address) {
        throw new Error('addressFromPrivateKey and utxoAddress not matched');
      }

      if (!privateKey) {
        throw new Error(`privateKey not found: ${address} ${fullPath}`);
      }

      ret[fullPath] = privateKey;
    }

    return ret;
  }

  async signBip322MessageSimple({
    encodedTx,
    account,
    message,
    signers,
    psbtNetwork,
  }: {
    encodedTx: IEncodedTx | null;
    account: ICoreApiSignAccount;
    message: string;
    signers: Partial<{ [address: string]: ISigner }>;
    psbtNetwork: networks.Network;
  }) {
    initBitcoinEcc();

    const addressInfo = validateBtcAddress({
      address: account.address,
      network: psbtNetwork,
    });

    if (!addressInfo.isValid) {
      throw new Error('Invalid address');
    }

    const supportedTypes = [EAddressEncodings.P2WPKH, EAddressEncodings.P2TR];
    if (
      !addressInfo.encoding ||
      (addressInfo.encoding && !supportedTypes.includes(addressInfo.encoding))
    ) {
      throw new AddressNotSupportSignMethodError({
        info: {
          type: 'Native Segwit, Taproot',
        },
      });
    }

    const outputScript = BitcoinJsAddress.toOutputScript(
      account.address,
      psbtNetwork,
    );

    const prevoutHash = Buffer.from(
      '0000000000000000000000000000000000000000000000000000000000000000',
      'hex',
    );
    const prevoutIndex = 0xff_ff_ff_ff;
    const sequence = 0;
    const scriptSig = Buffer.concat([
      Buffer.from('0020', 'hex'),
      Buffer.from(bip0322Hash(message), 'hex'),
    ]);

    const txToSpend = new BitcoinJsTransaction();
    txToSpend.version = 0;
    txToSpend.addInput(prevoutHash, prevoutIndex, sequence, scriptSig);
    txToSpend.addOutput(outputScript, BigInt(0));

    const psbtToSign = new Psbt();
    psbtToSign.setVersion(0);
    psbtToSign.addInput({
      hash: txToSpend.getHash(),
      index: 0,
      sequence: 0,
      witnessUtxo: {
        script: outputScript,
        value: BigInt(0),
      },
    });
    psbtToSign.addOutput({
      script: Buffer.from('6a', 'hex'),
      value: BigInt(0),
    });

    const inputsToSign = getInputsToSignFromPsbt({
      psbt: psbtToSign,
      psbtNetwork,
      account,
      isBtcWalletProvider: false,
    });

    await this.signPsbt({
      encodedTx,
      psbt: psbtToSign,
      signers,
      inputsToSign,
      network: psbtNetwork,
    });

    inputsToSign.forEach((v) => {
      psbtToSign.finalizeInput(v.index);
    });

    const txToSign = psbtToSign.extractTransaction();

    const len = VaruintBitCoinEncode(txToSign.ins[0].witness.length);
    const signature = Buffer.concat([
      Buffer.from(len.buffer),
      ...txToSign.ins[0].witness.map((w) => encodeVarString(Buffer.from(w))),
    ]);

    return signature;
  }

  async signPsbt({
    encodedTx,
    network,
    psbt,
    signers,
    inputsToSign,
    signOnly,
  }: {
    encodedTx: IEncodedTx | null;
    network: IBtcForkNetwork;
    psbt: Psbt;
    signers: Partial<{ [address: string]: ISigner }>;
    inputsToSign: ITxInputToSign[];
    signOnly?: boolean;
  }) {
    for (let i = 0, len = inputsToSign.length; i < len; i += 1) {
      const input = inputsToSign[i];
      const signer = this.pickSigner(signers, input.address);
      const bitcoinSigner = await this.getBitcoinSignerPro({
        network,
        signer,
        input: psbt.data.inputs[input.index],
        disableTweakSigner: input.disableTweakSigner,
        useTweakedSigner: input.useTweakedSigner,
      });
      await psbt.signInputAsync(input.index, bitcoinSigner, input.sighashTypes);
    }

    let rawTx = '';
    let finalizedPsbtHex = '';
    try {
      const finalizedPsbt = Psbt.fromHex(psbt.toHex(), { network });
      inputsToSign.forEach((v) => {
        finalizedPsbt.finalizeInput(v.index);
      });

      if (!signOnly) {
        rawTx = finalizedPsbt.extractTransaction().toHex();
      }
      finalizedPsbtHex = finalizedPsbt.toHex();
    } catch (error) {
      console.error('Failed to finalize PSBT:', error);
      // if can't finalize, use original psbt
      finalizedPsbtHex = psbt.toHex();
    }

    return {
      encodedTx,
      txid: '',
      rawTx,
      psbtHex: psbt.toHex(),
      finalizedPsbtHex,
    };
  }

  override async getPrivateKeys(
    payload: ICoreApiSignBasePayload,
  ): Promise<ICoreApiPrivateKeysMap> {
    const { password, relPaths } = payload;
    const isImported = !!payload.credentials.imported;
    const privateKeys = await this.baseGetPrivateKeys({
      payload,
      curve: curveName,
    });
    if (isImported) {
      await this.appendImportedRelPathPrivateKeys({
        privateKeys,
        password,
        relPaths,
      });
    }
    return privateKeys;
  }

  override async getAddressFromPrivate(
    query: ICoreApiGetAddressQueryImportedBtc,
  ): Promise<ICoreApiGetAddressItem> {
    const {
      privateKeyRaw, // xPrivateKey hex format but not single address privateKey
      networkInfo,
      addressEncoding,
    } = query;
    const network = getBtcForkNetwork(networkInfo.networkChainCode);

    const { xpub } = getBtcXpubFromXprvt({
      privateKeyRaw, // hex privateKey
      network,
    });
    const pubKey = getPublicKeyFromXpub({
      xpub,
      network,
      relPath: '0/0',
    });

    const usedAddressEncoding = addressEncoding;
    // if (template && !usedAddressEncoding) {
    //   if (template.startsWith(`m/44'/`)) {
    //     usedAddressEncoding = EAddressEncodings.P2PKH;
    //   } else if (template.startsWith(`m/86'/`)) {
    //     usedAddressEncoding = EAddressEncodings.P2TR;
    //   } else {
    //     usedAddressEncoding = undefined;
    //   }
    // }

    const firstAddressRelPath = '0/0';
    const { addresses, xpubSegwit } = await this.getAddressFromXpub({
      network,
      xpub,
      relativePaths: [firstAddressRelPath],
      addressEncoding: usedAddressEncoding,
    });
    const { [firstAddressRelPath]: address } = addresses;
    return Promise.resolve({
      publicKey: pubKey,
      xpub,
      xpubSegwit,
      relPath: firstAddressRelPath,
      address,
      addresses,
    });
  }

  override async getAddressesFromHd(
    query: ICoreApiGetAddressesQueryHdBtc,
  ): Promise<ICoreApiGetAddressesResult> {
    defaultLogger.account.accountCreatePerf.getAddressesFromHdBtc();

    const {
      template,
      hdCredential,
      password,
      indexes,
      networkInfo: { networkChainCode },
      addressEncoding,
    } = query;

    // template:  "m/49'/0'/$$INDEX$$'/0/0"
    // { pathPrefix: "m/49'/0'", pathSuffix: "{index}'/0/0" }
    const { pathPrefix } = slicePathTemplate(template);

    // 0 -> 0'
    // 1 -> 1'
    // relPaths:  ["0'", "1'"]
    const relPaths: string[] = indexes.map(
      (index) => `${index.toString()}'`, // btc
      // (index) => pathSuffix.replace('{index}', index.toString()), // evm
    );

    defaultLogger.account.accountCreatePerf.batchGetPublicKeysBtc();
    // pubkeyInfos.map(i=>i.path)
    //    ["m/49'/0'/0'", "m/49'/0'/1'"]
    const pubkeyInfos = await batchGetPublicKeysAsync({
      curveName,
      hdCredential,
      password,
      prefix: pathPrefix, // m/49'/0'
      relPaths, // 0'   1'
    });
    defaultLogger.account.accountCreatePerf.batchGetPublicKeysBtcDone();

    if (pubkeyInfos.length !== indexes.length) {
      throw new OneKeyInternalError('Unable to get publick key.');
    }

    if (!networkChainCode) {
      throw new Error('networkChainCode is required');
    }

    const network = getBtcForkNetwork(networkChainCode);

    const { public: xpubVersionBytes } =
      ((network.segwitVersionBytes || {})[
        addressEncoding
      ] as typeof network.bip32) || network.bip32;

    defaultLogger.account.accountCreatePerf.mnemonicFromEntropy();
    const mnemonic = await mnemonicFromEntropyAsync({
      hdCredential,
      password,
    });
    defaultLogger.account.accountCreatePerf.mnemonicFromEntropyDone();

    defaultLogger.account.accountCreatePerf.mnemonicToSeed();
    const seed = await mnemonicToSeedAsync({ mnemonic });
    defaultLogger.account.accountCreatePerf.mnemonicToSeedDone();

    defaultLogger.account.accountCreatePerf.seedToRootBip32();
    const root = getBitcoinBip32().fromSeed(seed);
    defaultLogger.account.accountCreatePerf.seedToRootBip32Done();

    const xpubBuffers = [
      Buffer.from(xpubVersionBytes.toString(16).padStart(8, '0'), 'hex'),
      Buffer.from([3]),
    ];

    const addresses: ICoreApiGetAddressItem[] = await Promise.all(
      pubkeyInfos.map(async (info, index) => {
        const { path, parentFingerPrint, extendedKey } = info;

        defaultLogger.account.accountCreatePerf.bip32DerivePath();
        const node = root.derivePath(`${path}/0/0`);

        defaultLogger.account.accountCreatePerf.derivePathKeyPair();
        const keyPair = getBitcoinECPair().fromWIF(node.toWIF());

        const publicKey = keyPair.publicKey.toString('hex');

        defaultLogger.account.accountCreatePerf.keypairToXpub();
        const xpub = bs58check.encode(
          Buffer.concat([
            ...xpubBuffers,
            parentFingerPrint,
            Buffer.from(
              (indexes[index] + 2 ** 31).toString(16).padStart(8, '0'),
              'hex',
            ),
            extendedKey.chainCode,
            extendedKey.key,
          ]),
        );
        defaultLogger.account.accountCreatePerf.keypairToXpubDone();

        const firstAddressRelPath = '0/0';
        const relativePaths = [firstAddressRelPath];

        defaultLogger.account.accountCreatePerf.xpubToAddress();
        let { addresses: addressesMap, xpubSegwit } =
          await this.getAddressFromXpub({
            network,
            xpub,
            relativePaths,
            addressEncoding,
          });
        defaultLogger.account.accountCreatePerf.xpubToAddressDone();

        const { [firstAddressRelPath]: address } = addressesMap;

        defaultLogger.account.accountCreatePerf.xpubToSegwit();
        // rebuild xpubSegwit by hd account descriptor
        xpubSegwit = await buildBtcXpubSegwitAsync({
          xpub,
          addressEncoding,
          hdAccountPayload: {
            curveName,
            hdCredential,
            password,
            path,
          },
        });
        defaultLogger.account.accountCreatePerf.xpubToSegwitDone();

        const addressItem: ICoreApiGetAddressItem = {
          address,
          publicKey,
          path,
          relPath: firstAddressRelPath,
          xpub,
          xpubSegwit,
          addresses: { [firstAddressRelPath]: address },
        };

        return addressItem;
      }),
    );
    defaultLogger.account.accountCreatePerf.getAddressesFromHdBtcDone();
    return { addresses };
  }

  // call collectInfoForSoftwareSign outside
  override async signTransaction(
    payload: ICoreApiSignTxPayload,
  ): Promise<ISignedTxPro> {
    const {
      unsignedTx,
      networkInfo: { networkChainCode },
      relPaths,
      signOnly,
    } = payload;
    const encodedTx = unsignedTx.encodedTx as IEncodedTxBtc;
    const { psbtHex, inputsToSign } = encodedTx;

    if (!relPaths?.length) {
      throw new Error('BTC sign transaction need relPaths');
    }

    const network = getBtcForkNetwork(networkChainCode);

    // build signers
    const signers = await this.buildSignersMap({
      payload,
    });

    // signPsbtTransaction()
    if (psbtHex && inputsToSign) {
      const PsbtFn = Psbt;
      const psbt = Psbt.fromHex(psbtHex, { network });
      const psbt2 = psbt;
      const b1 = psbt.data.inputs[0].witnessScript;
      const b2 = psbt.data.inputs[0].witnessUtxo?.script;

      const paymentsFn = payments;
      let pubkeyStr1;
      let pubkeyStr2;
      let pubkeyStr3;
      let pubkeyStr4;
      let pubkeyStr5;
      try {
        const r1 = paymentsFn.p2tr({ output: b2, network });
        pubkeyStr1 = r1?.pubkey
          ? Buffer.from(r1.pubkey).toString('hex')
          : undefined;
      } catch (error) {
        // Handle the error here
      }

      try {
        const r2 = payments.p2pkh({ output: b2, network });
        pubkeyStr2 = r2?.pubkey
          ? Buffer.from(r2.pubkey).toString('hex')
          : undefined;
      } catch (error) {
        // Handle the error here
      }

      try {
        const r3 = payments.p2sh({ output: b2, network });
        pubkeyStr3 = r3?.pubkey
          ? Buffer.from(r3.pubkey).toString('hex')
          : undefined;
      } catch (error) {
        // Handle the error here
      }

      try {
        const r4 = payments.p2wpkh({ output: b2, network });
        pubkeyStr4 = r4?.pubkey
          ? Buffer.from(r4.pubkey).toString('hex')
          : undefined;
      } catch (error) {
        // Handle the error here
      }

      try {
        const r5 = payments.p2wsh({ output: b2, network });
        pubkeyStr5 = r5?.pubkey
          ? Buffer.from(r5.pubkey).toString('hex')
          : undefined;
      } catch (error) {
        // Handle the error here
      }

      return this.signPsbt({
        encodedTx: unsignedTx.encodedTx,
        network,
        psbt,
        signers,
        inputsToSign,
        signOnly,
      });
    }

    // signNormalTransaction()
    const psbt = await this.packTransactionToPSBT({
      network,
      signers,
      payload,
    });

    if (process.env.NODE_ENV !== 'production') {
      const buildPsbtHex = psbt.toHex();
      console.log('BTC buildPsbtHex:', buildPsbtHex);
    }

    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < encodedTx.inputs.length; ++i) {
      const { address } = encodedTx.inputs[i];
      const signer = this.pickSigner(signers, address);
      // internal build tx all inputs belong to self account, so we can just first input address
      const psbtInput = psbt.data.inputs[0];
      const bitcoinSigner = await this.getBitcoinSignerPro({
        signer,
        input: psbtInput,
        network,
      });
      await psbt.signInputAsync(i, bitcoinSigner);
    }

    const { txid, rawTx } = await this.extractPsbtToSignedTx({ psbt });
    return {
      encodedTx: unsignedTx.encodedTx,
      txid,
      rawTx,
      psbtHex: undefined,
    };
  }

  async extractPsbtToSignedTx({ psbt }: { psbt: Psbt }) {
    psbt.validateSignaturesOfAllInputs(validator);

    let tx;
    try {
      tx = psbt.finalizeAllInputs().extractTransaction();
    } catch (error) {
      console.error('extractPsbtToSignedTx ERROR: ', error);
      // tx = psbt.extractTransaction();
      throw error;
    }

    const result = {
      txid: tx.getId(),
      rawTx: tx.toHex(),
    };
    return Promise.resolve(result);
  }

  pickSigner(
    signers: Partial<{ [address: string]: ISigner }>,
    address: string,
  ) {
    const signer = signers[address];
    if (!signer) {
      throw new Error(`BTC signer not found: ${address}`);
    }
    return signer;
  }

  override async signMessage(payload: ICoreApiSignMsgPayload): Promise<string> {
    const {
      account,
      networkInfo: { networkChainCode },
      relPaths,
    } = payload;

    if (!relPaths?.length) {
      throw new Error('BTC sign message need relPaths');
    }

    const unsignedMsg = payload.unsignedMsg as IUnsignedMessageBtc;
    const network = getBtcForkNetwork(networkChainCode);

    const signers = await this.buildSignersMap({ payload });

    if (unsignedMsg.type === EMessageTypesBtc.BIP322_SIMPLE) {
      const buffer = await this.signBip322MessageSimple({
        encodedTx: null,
        account,
        message: unsignedMsg.message,
        signers,
        psbtNetwork: network,
      });
      return bufferUtils.bytesToHex(buffer);
    }

    const signer = this.pickSigner(signers, account.address);

    const privateKey = await signer.getPrvkey();
    const keyPair = getBitcoinECPair().fromPrivateKey(privateKey, {
      network,
    });
    const sigOptions = unsignedMsg.sigOptions || { segwitType: 'p2wpkh' };
    const signature = bitcoinMessage.sign(
      unsignedMsg.message,
      checkIsDefined(keyPair.privateKey),
      keyPair.compressed,
      sigOptions,
    );
    return bufferUtils.bytesToHex(signature);
  }
}
