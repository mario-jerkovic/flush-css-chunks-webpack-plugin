const { ConcatSource } = require('webpack-sources');
const { matchObject } = require('webpack/lib/ModuleFilenameHelpers');

const pluginName = 'flush-css-chunks';

function isInitial(chunk) {
  let parentCount = 0;

  // eslint-disable-next-line no-restricted-syntax
  for (const chunkGroup of chunk.groupsIterable) {
    parentCount += chunkGroup.getNumberOfParents();
  }

  return chunk.isOnlyInitial() || parentCount === 0;
}

function generateAssetMapping(path, assets) {
  const mapping = {};
  const assetKeys = Object.keys(assets);

  assetKeys.forEach((assetKey) => {
    if (Array.isArray(assets[assetKey])) {
      assets[assetKey].forEach((assetPath) => {
        if (assetPath.includes('.css')) {
          Object.assign(mapping, { [assetKey]: `${path}${assetPath}` });
        }
      });
    }
  });

  return mapping;
}

function generateAssetsHook(mapping = {}) {
  return (`
        if (typeof window === "object") {
            window.__CSS_CHUNKS__ = ${JSON.stringify(mapping)};
        }
    `).trim();
}

class FlushCSSChunks {
  constructor(options = {}) {
    if (options.entries != null && !Array.isArray(options.entries)) {
      throw new Error('Invalid Options\n\noptions.entries should be array\n');
    }

    this.options = Object.assign({
      entryOnly: false,
      assetPath: null,
      entries: null,
    }, options);
  }

  static injectAssetsMapping(compilation, file, assetMapping) {
    const newSource = new ConcatSource(assetMapping);

    newSource.add(compilation.assets[file]);

    return Object.assign(compilation.assets, { [file]: newSource });
  }

  apply(compiler) {
    compiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
      compilation.hooks.optimizeChunkAssets.tapAsync(pluginName, (chunks, callback) => {
        const { publicPath } = compiler.options.output;
        const { assetsByChunkName } = compilation.getStats().toJson();

        const assetMapping = generateAssetsHook(
          generateAssetMapping(
            this.options.assetPath || publicPath,
            assetsByChunkName,
          ),
        );

        chunks.forEach((chunk) => {
          if (this.options.entryOnly && !isInitial(chunk)) {
            return;
          }

          if (this.options.entryOnly &&
            this.options.entries && !this.options.entries.includes(chunk.name)) {
            return;
          }

          chunk.files
            .filter(file => (
              matchObject({ test: new RegExp(/^(.(.*.js))*$/) }, file)
            ))
            .forEach(file => (
              FlushCSSChunks.injectAssetsMapping(compilation, file, assetMapping)
            ));
        });

        callback();
      });
    });
  }
}

module.exports = FlushCSSChunks;
