# Release Process

This document describes the release process for the askrepo project.

## Version Management

The project follows [Semantic Versioning](https://semver.org/) with the
following format: `MAJOR.MINOR.PATCH`

- `MAJOR`: Incremented for incompatible API changes
- `MINOR`: Incremented for backwards-compatible functionality additions
- `PATCH`: Incremented for backwards-compatible bug fixes

## Automatic Patch Version Updates

When code is pushed to the `main` branch, the following happens automatically:

1. The patch version is automatically incremented
2. The version in `deno.json` is updated
3. A new entry is added to `CHANGELOG.md`
4. Changes are committed and pushed back to the repository
5. The package is published to JSR

For example, if the current version is `0.3.1`, pushing to `main` will
automatically:

- Update the version to `0.3.2`
- Add a new entry in `CHANGELOG.md`
- Publish the new version

## Manual Version Updates

For major or minor version updates, manual intervention is required:

1. Edit `deno.json` to update the version number
2. Update `CHANGELOG.md` with the changes
3. Commit and push the changes

Examples:

- For a new feature: Update from `0.3.2` to `0.4.0`
- For a breaking change: Update from `0.3.2` to `1.0.0`

## Release Workflow

The release process is managed by GitHub Actions in
`.github/workflows/publish.yml`. The workflow:

1. Runs tests
2. Updates the patch version (if needed)
3. Updates the changelog
4. Commits the changes
5. Publishes to JSR

## Best Practices

1. Always update `CHANGELOG.md` when making significant changes
2. Use meaningful commit messages
3. Test changes thoroughly before pushing to `main`
4. For major version updates, ensure all breaking changes are documented
