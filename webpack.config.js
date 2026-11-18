const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env) => {
    const isDebug = env && (env.NODE_ENV === 'dev' || env.NODE_ENV === 'test');

    return {
        entry: './src/game.ts',
        mode: env?.NODE_ENV === 'dev' ? 'development' : 'production',
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: 'bundle.js',
            clean: true,
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    use: [
                        {
                            loader: 'ts-loader',
                            options: {
                                onlyCompileBundledFiles: true,
                            },
                        },
                    ],
                    exclude: /node_modules/,
                },
            ],
        },
        devServer: {
            static: {
                directory: path.resolve(__dirname, './dist'),
            },
            host: '0.0.0.0',
            port: 8080,
            open: true,
        },
        resolve: {
            extensions: ['.ts', '.js'],
            // Without this, webpack 5's default mainFields order
            // ('browser', 'module', 'main') picks i18next's ESM build
            // (dist/esm/i18next.js, real `export {}` syntax) even though
            // ts-loader compiles our TS down to CommonJS `require()` calls
            // (tsconfig.json's `module: "commonjs"`) — the resulting
            // ESM/CJS interop mismatch left the default import undefined
            // at runtime. Preferring 'main' resolves to the CJS build
            // instead (a plain `module.exports = instance`), which
            // `require()` handles unambiguously.
            mainFields: ['browser', 'main'],
            alias: {
                'three$': path.resolve(__dirname, 'node_modules/three/build/three.module.js'),
                phaser: path.resolve(
                    __dirname,
                    'node_modules/phaser/dist/phaser.js'
                ),
            },
        },
        plugins: [
            new webpack.DefinePlugin({
                // SURA mode/gameId/apiBaseUrl/parentOrigin are all decided at
                // runtime now (window.parent/ReactNativeWebView detection +
                // the host's own INIT_GAME payload) — one build works in
                // every environment, so none of those need a build-time env
                // var anymore. See src/integration/sura/SuraRuntimeConfig.ts.
                'process.env.IS_DEBUG': JSON.stringify(isDebug),
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: 'assets/img/**',
                        to: '.',
                        globOptions: {
                            ignore: ['**/*.xcf', '**/*.inkscape.svg', '**/*.psd', '**/*source*.png', '**/*.bak.png'],
                        },
                    },
                    { from: 'assets/coins/**', to: '.' },
                    { from: 'assets/jar/frasco1_transparent.png', to: 'assets/jar/frasco1_transparent.png' },
                    { from: 'assets/bg/**', to: '.' },
                    { from: 'assets/sounds/**', to: '.' },
                    { from: 'index.html', to: '.' },
                    // Guarda de input de SURA. Tiene que llegar al dist o el
                    // tag del index apunta a un archivo que no existe: el juego
                    // seguiria andando, pero sin la proteccion y sin aviso.
                    { from: 'sura-input-guard.js', to: '.' },
                    { from: 'index.css', to: '.' },
                    { from: 'favicon.ico', to: '.' },
                    { from: 'icon*.png', to: '.' },
                    { from: 'manifest.json', to: '.' },
                ],
            }),
        ],
    };
};
