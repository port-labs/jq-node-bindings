const config = {
	verbose: true,
	testMatch: ['**/?(*.)+(spec|test).[jt]s'],
	reporters: [
		'default',
		['jest-junit', {outputDirectory: 'reports', outputName: 'jest-port-api.xml'}]
	],
	bail: true,
};
module.exports = config;
