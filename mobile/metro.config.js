// Lets Metro bundle the platform-independent logic shared with the web app (../src),
// which lives outside this Expo project.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '..', 'src');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];

// Package imports made by shared files (e.g. 'react') must resolve to this app's node_modules,
// never the web app's, or the bundle would contain two copies of React.
// The mobile app always uses the React Native storage and compute modules, including in its web
// preview build (react-native-web); the browser versions belong to the Vite web app.
const NATIVE_ONLY = /(^|\/)(storage\/storage|workers\/client)$/;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (NATIVE_ONLY.test(moduleName)) moduleName = `${moduleName}.native`;
  const fromShared = context.originModulePath.startsWith(sharedRoot + path.sep);
  const isPackage = !moduleName.startsWith('.') && !path.isAbsolute(moduleName);
  if (fromShared && isPackage) {
    return context.resolveRequest({ ...context, originModulePath: path.join(projectRoot, 'index.js') }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
