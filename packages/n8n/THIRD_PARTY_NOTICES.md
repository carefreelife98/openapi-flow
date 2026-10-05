# Third-party notices

`@openapi-flow/n8n` depends on `@n8n/workflow-sdk`, separately licensed under n8n's [Sustainable Use License](https://github.com/n8n-io/n8n/blob/master/LICENSE.md). Its terms restrict use and redistribution; check them for your intended use. This package does not bundle the SDK's source code.

Other dependencies retain their own licenses. The MIT license in this package applies to openapi-flow's code only.

Runtime-bound HTTP requests include library-owned materialization code and an Ajv-generated standalone request validator. Any bundled validator dependency retains its complete license notice in the generated Code node. Ajv and ajv-formats are MIT-licensed; their transitive runtime helpers retain their own MIT or BSD notices when bundled. The schema compiler and the n8n SDK are not embedded in these Code nodes. esbuild is used on the host to bundle standalone runtime code and is separately MIT-licensed.
