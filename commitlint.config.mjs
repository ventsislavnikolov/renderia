export default {
	extends: ["@commitlint/config-conventional"],
	parserPreset: {
		parserOpts: {
			headerPattern: /^(?:\S+\s+)?(\w*)(?:\((.*)\))?!?: (.*)$/,
			breakingHeaderPattern: /^(?:\S+\s+)?(\w*)(?:\((.*)\))?!: (.*)$/,
		},
	},
	rules: {
		"header-max-length": [2, "always", 120],
		"body-max-line-length": [0, "always"],
		"footer-max-line-length": [0, "always"],
	},
};
