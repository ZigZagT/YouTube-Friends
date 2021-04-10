module.exports = {
    presets: ['next/babel'],
    plugins: [
        [
            'module-resolver',
            {
                root: ['.'],
                cwd: 'babelrc',
                extensions: ['.js', '.jsx', '.ts', '.tsx'],
            },
        ],
        [
            'babel-plugin-styled-components',
            {
                ssr: true,
            },
        ],
    ],
};
