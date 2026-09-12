let withAndroidManifest;
let createRunOncePlugin;

try {
  const plugins = require('@expo/config-plugins');
  withAndroidManifest = plugins.withAndroidManifest;
  createRunOncePlugin = plugins.createRunOncePlugin;
} catch (e) {
  // Gracefully handle non-Expo environments
}

const pkg = require('./package.json');

function modifyAndroidManifest(config) {
  if (!withAndroidManifest) return config;

  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest.queries) {
      manifest.queries = [];
    }

    const solanaIntent = {
      intent: [
        {
          action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
          category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
          data: [{ $: { 'android:scheme': 'solana-wallet' } }],
        },
      ],
    };

    const hasSolanaQuery = manifest.queries.some((q) =>
      q.intent &&
      q.intent.some(
        (i) => i.data && i.data.some((d) => d.$ && d.$['android:scheme'] === 'solana-wallet')
      )
    );

    if (!hasSolanaQuery) {
      manifest.queries.push(solanaIntent);
    }

    return config;
  });
}

function withShaheen(config) {
  return modifyAndroidManifest(config);
}

module.exports = createRunOncePlugin
  ? createRunOncePlugin(withShaheen, pkg.name, pkg.version)
  : withShaheen;
