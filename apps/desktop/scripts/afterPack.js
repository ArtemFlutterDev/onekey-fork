const fs = require('fs');
const path = require('path');
const { FuseVersion, FuseV1Options } = require('@electron/fuses');

exports.default = async function fileOperation(context) {
  // https://www.electron.build/app-builder-lib.typealias.electronplatformname
  // ElectronPlatformName: "darwin" | "linux" | "win32" | "mas"
  const { electronPlatformName, appOutDir } = context;
  const appName = context.packager.appInfo.productFilename;
  if (electronPlatformName === 'mas' && appOutDir.endsWith('universal')) {
    const appPath = `${appOutDir}/${appName}.app`;
    const destDir = path.join(appPath, 'Contents/Resources/bin/bridge');
    const originPath = path.join(
      __dirname,
      '../app/build/static/bin/bridge/mac-x64',
    );
    console.log('copy file start..', originPath);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(
      path.join(originPath, 'onekeyd'),
      path.join(destDir, 'onekeyd'),
    );
    console.log('copy file finish');
    console.log('remove file start..');
    const ethereumCryptographyFilePath = path.join(
      appPath,
      'Contents/Resources/app.asar.unpacked/node_modules/ethereum-cryptography/node_modules/secp256k1/build/node_gyp_bins',
    );
    const keccakFilePath = path.join(
      appPath,
      'Contents/Resources/app.asar.unpacked/node_modules/keccak/build/node_gyp_bins',
    );
    if (fs.existsSync(ethereumCryptographyFilePath)) {
      fs.rmSync(ethereumCryptographyFilePath, { recursive: true });
    }
    if (fs.existsSync(keccakFilePath)) {
      fs.rmSync(keccakFilePath, { recursive: true });
    }
    console.log('remove file finish..');
  }

  if (electronPlatformName === 'darwin' || electronPlatformName === 'win32') {
    await context.packager.addElectronFuses(context, {
      version: FuseVersion.V1,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    });
  }
};
