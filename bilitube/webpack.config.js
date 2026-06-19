const path = require('path');
const Dotenv = require('dotenv-webpack');

module.exports = {
    entry: './src/index.js',
    mode: 'production',
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader"
                }
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            },
            {
                test: /\.(png|jpg|jpeg|gif|webp|svg)$/i,
                type: 'asset/resource'
            }
        ]
    },
    resolve: {
        extensions: ['.*', '.js', '.jsx']
    },
    output: {
        filename: 'content.js',
        path: path.resolve(__dirname, '..', 'extension'),
        assetModuleFilename: '[name][hash:8][ext]'
    },
    plugins: [
        new Dotenv()
    ],
    cache: {
        type: 'filesystem'
    }
};