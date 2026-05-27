export default {
	branches: ["main"],
	plugins: [
		[
			"@semantic-release/commit-analyzer",
			{
				preset: "conventionalcommits",
				parserOpts: {
					// allow optional leading emoji + optional space
					headerPattern:
						/^(?:\p{Extended_Pictographic}\s*)?(\w+)(?:\(([^)]+)\))?: (.+)$/u,
					headerCorrespondence: ["type", "scope", "subject"],
				},
			},
		],
		"@semantic-release/release-notes-generator",
		[
			"@semantic-release/changelog",
			{
				changelogFile: "CHANGELOG.md",
			},
		],
		[
			"@semantic-release/npm",
			{
				npmPublish: false,
			},
		],
		[
			"@semantic-release/git",
			{
				assets: ["dist/", "package.json", "CHANGELOG.md"],
				message:
					"chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
			},
		],
		"@semantic-release/github",
		[
			"semantic-release-ado",
			{
				varName: "semanticVersion",
				setOnlyOnRelease: false,
			},
		],
	],
};
