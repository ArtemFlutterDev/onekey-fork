import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { BigNumber } from 'bignumber.js';
import { MsgSend } from 'cosmjs-types/cosmos/bank/v1beta1/tx';
import { AuthInfo, TxBody } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { get } from 'lodash';
import Long from 'long';

import { defaultAminoDecodeRegistry } from '../amino/aminoDecode';
import { defaultAminoMsgOpts } from '../amino/types';
import { ECosmosMessageType } from '../message';
import { ProtoSignDoc } from '../proto/protoSignDoc';

import type { TransactionWrapper } from '.';
import type { ICosmosStdFee } from '../../types';
import type { ICosmosStdPublickey, ICosmosStdSignDoc } from '../amino/types';
import type { ICosmosUnpackedMessage } from '../proto/protoDecode';
import type { Coin } from 'cosmjs-types/cosmos/base/v1beta1/coin';

export function getDirectSignDoc(tx: TransactionWrapper): ProtoSignDoc {
  if (tx.mode === 'amino') {
    throw new Error('Sign doc is encoded as Amino Json');
  }

  if ('msgs' in tx.signDoc) {
    throw new Error('Sign doc is encoded as Amino Json');
  }
  return new ProtoSignDoc(tx.signDoc);
}

export function getAminoSignDoc(tx: TransactionWrapper): ICosmosStdSignDoc {
  if (tx.mode === 'direct') {
    throw new Error('Sign doc is encoded as Protobuf');
  }

  if (!('msgs' in tx.signDoc)) {
    throw new Error('Unexpected error');
  }

  return tx.signDoc;
}

export function getChainId(tx: TransactionWrapper) {
  if (tx.mode === 'amino') {
    return getAminoSignDoc(tx).chain_id;
  }

  return getDirectSignDoc(tx).chainId;
}

export function getMsgs(tx: TransactionWrapper): ICosmosUnpackedMessage[] {
  if (tx.mode === 'amino') {
    return getAminoSignDoc(tx).msgs.map((msg) =>
      defaultAminoDecodeRegistry.unpackMessage(msg),
    );
  }

  return getDirectSignDoc(tx).txMsgs;
}

export function getMemo(signDoc: TransactionWrapper): string {
  if (signDoc.mode === 'amino') {
    return getAminoSignDoc(signDoc).memo;
  }

  return getDirectSignDoc(signDoc).txBody.memo;
}

export function getFeeAmount(signDoc: TransactionWrapper): readonly Coin[] {
  if (signDoc.mode === 'amino') {
    return getAminoSignDoc(signDoc).fee.amount;
  }

  const fees: Coin[] = [];
  for (const coinObj of getDirectSignDoc(signDoc).authInfo.fee?.amount ?? []) {
    if (coinObj.denom == null || coinObj.amount == null) {
      throw new Error('Invalid fee');
    }
    fees.push({
      denom: coinObj.denom,
      amount: coinObj.amount,
    });
  }

  return fees;
}

export function getFee(signDoc: TransactionWrapper): ICosmosStdFee {
  if (signDoc.mode === 'amino') {
    const { fee } = getAminoSignDoc(signDoc);
    return {
      amount: fee.amount,
      gas_limit: fee.gas,
      payer: '',
      granter: '',
    };
  }

  const { fee } = getDirectSignDoc(signDoc).authInfo;

  return {
    amount: fee ? [...fee.amount] : [],
    gas_limit: fee?.gasLimit?.toString() ?? '0',
    payer: fee?.payer ?? '',
    granter: fee?.granter ?? '',
    feePayer: fee?.granter ?? '',
  };
}

export function setFee(signDoc: TransactionWrapper, fee: ICosmosStdFee) {
  const newSignDoc = signDoc;
  if (newSignDoc.mode === 'amino') {
    const aminoSignDoc = getAminoSignDoc(newSignDoc);
    aminoSignDoc.fee = {
      amount: fee.amount,
      gas: fee.gas_limit,
    };

    // @ts-expect-error
    newSignDoc.signDoc.fee = aminoSignDoc.fee;
    return newSignDoc;
  }

  const directSignDoc = getDirectSignDoc(newSignDoc);
  directSignDoc.authInfo = {
    ...directSignDoc.authInfo,
    fee: {
      amount: fee.amount,
      gasLimit: Long.fromString(fee.gas_limit),
      payer: fee.payer ?? '',
      granter: fee.granter ?? '',
    },
  };

  // @ts-expect-error
  newSignDoc.authInfoBytes = bytesToHex(
    AuthInfo.encode(directSignDoc.authInfo).finish(),
  );
  return newSignDoc;
}

export function setSendAmount(tx: TransactionWrapper, amount: string) {
  const newTx = tx;

  const [aminoMsg] = newTx.msg?.aminoMsgs ?? [];
  let aminoMsgValue;
  if (aminoMsg) {
    aminoMsgValue = [
      {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        denom: get(aminoMsg.value.amount, '[0].denom'),
        amount: new BigNumber(amount).toFixed(),
      },
    ];

    if (newTx?.msg?.aminoMsgs[0]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      newTx.msg.aminoMsgs[0].value.amount = aminoMsgValue;
    }
  }

  const [protoMsg] = newTx.msg?.protoMsgs ?? [];
  let protoMsgValue;
  if (protoMsg) {
    if (protoMsg.typeUrl !== ECosmosMessageType.SEND) {
      throw new Error('Invalid message type');
    }

    const sendMsg = MsgSend.decode(hexToBytes(protoMsg.value));
    protoMsgValue = MsgSend.encode({
      ...sendMsg,
      amount: [
        {
          denom: sendMsg.amount[0].denom,
          amount: new BigNumber(amount).toFixed(),
        },
      ],
    }).finish();

    if (newTx?.msg?.protoMsgs[0]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      newTx.msg.protoMsgs[0].value = bytesToHex(protoMsgValue);
    }
  }

  if (newTx.mode === 'amino') {
    const aminoSignDoc = getAminoSignDoc(newTx);
    const msg = aminoSignDoc.msgs[0];
    if (msg.type !== defaultAminoMsgOpts.send.native.type) {
      throw new Error('Unexpected error');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    msg.value.amount = aminoMsgValue;

    // @ts-expect-error
    newTx.signDoc.msgs = aminoSignDoc.msgs;
    // // @ts-expect-error
    // tx.msg?.aminoMsgs[0].value = msg.value;
    // // @ts-expect-error
    // tx.msg?.protoMsgs[0].value = msg.value;
    return newTx;
  }

  const directSignDoc = getDirectSignDoc(newTx);
  const msg = directSignDoc.txMsgs[0];
  if (msg.typeUrl !== ECosmosMessageType.SEND) {
    throw new Error('Invalid message type');
  }
  directSignDoc.txBody = {
    ...directSignDoc.txBody,
    messages: [
      {
        typeUrl: ECosmosMessageType.SEND,
        value: protoMsgValue ?? new Uint8Array(),
      },
    ],
  };

  // @ts-expect-error
  newTx.signDoc.bodyBytes = bytesToHex(
    TxBody.encode(directSignDoc.txBody).finish(),
  );
  return newTx;
}

export function getSendAmount(tx: TransactionWrapper, denom: string) {
  const aminoMsgs = tx.msg?.aminoMsgs ?? [];
  let amount = '';
  let amountFound = aminoMsgs.some((aminoMsg) => {
    if (aminoMsg.type === defaultAminoMsgOpts.send.native.type) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const tokenDenom = get(aminoMsg.value.amount, '[0].denom');
      if (tokenDenom === denom) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        amount = get(aminoMsg.value.amount, '[0].amount');
        return true;
      }
    }
    return false;
  });
  if (amountFound) {
    return amount;
  }

  const protoMsgs = tx.msg?.protoMsgs ?? [];
  amountFound = protoMsgs.some((protoMsg) => {
    if (protoMsg.typeUrl === ECosmosMessageType.SEND) {
      const sendMsg = MsgSend.decode(hexToBytes(protoMsg.value));
      const tokenDenom = sendMsg.amount[0].denom;
      if (tokenDenom === denom) {
        amount = sendMsg.amount[0].amount;
        return true;
      }
    }
    return false;
  });
  if (amountFound) {
    return amount;
  }
}

export function getGas(signDoc: TransactionWrapper): number {
  if (signDoc.mode === 'amino') {
    const limit = getAminoSignDoc(signDoc).fee.gas;
    if (limit == null) {
      return 0;
    }
    return parseInt(limit, 10);
  }

  const directSignDoc = getDirectSignDoc(signDoc);
  if (directSignDoc.authInfo?.fee?.gasLimit) {
    return directSignDoc.authInfo.fee?.gasLimit.toNumber() ?? 0;
  }
  return 0;
}

export function getSequence(signDoc: TransactionWrapper): BigNumber {
  if (signDoc.mode === 'amino') {
    return new BigNumber(getAminoSignDoc(signDoc).sequence ?? '0');
  }

  const { signerInfos } = getDirectSignDoc(signDoc).authInfo;

  return (
    signerInfos
      .map((s) => new BigNumber(s.sequence.toString()))
      .sort((a, b) => b.comparedTo(a))[0] ?? new BigNumber(0)
  );
}

function sortObjectByKey(obj: Record<string, any>): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  if (Array.isArray(obj)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return obj.map(sortObjectByKey);
  }
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, any> = {};
  sortedKeys.forEach((key) => {
    result[key] = sortObjectByKey(obj[key]);
  });
  return result;
}

export function sortedJsonByKeyStringify(obj: Record<string, any>): string {
  return JSON.stringify(sortObjectByKey(obj));
}

export function getADR36SignDoc(
  signer: string,
  data: string,
): ICosmosStdSignDoc {
  return {
    chain_id: '',
    account_number: '0',
    sequence: '0',
    fee: {
      gas: '0',
      amount: [],
    },
    msgs: [
      {
        type: 'sign/MsgSignData',
        value: {
          signer,
          data,
        },
      },
    ],
    memo: '',
  };
}

export function encodeSecp256k1Pubkey(pubkey: Uint8Array): ICosmosStdPublickey {
  if (pubkey.length !== 33 || (pubkey[0] !== 0x02 && pubkey[0] !== 0x03)) {
    throw new Error(
      'Public key must be compressed secp256k1, i.e. 33 bytes starting with 0x02 or 0x03',
    );
  }
  return {
    type: 'tendermint/PubKeySecp256k1',
    value: Buffer.from(pubkey).toString('base64'),
  };
}
