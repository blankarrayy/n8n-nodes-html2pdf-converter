import test from 'node:test';
import assert from 'node:assert';
import * as http from 'node:http';
import { HtmlToPdf } from '../nodes/HtmlToPdf/HtmlToPdf.node';

test('HtmlToPdf - Node description has expected properties', () => {
	const node = new HtmlToPdf();
	assert.strictEqual(node.description.name, 'htmlToPdf');
	assert.strictEqual(node.description.displayName, 'HTML to PDF');
	assert.strictEqual(node.description.icon, 'file:htmltopdf.svg');
	assert.ok(node.description.properties.length > 0);

	const optionsProp = node.description.properties.find((p) => p.name === 'options') as any;
	assert.ok(optionsProp);
	assert.deepStrictEqual(optionsProp.default, {
		pageSize: 'A4',
		orientation: 'Portrait',
		allowRemoteAssets: true,
	});
});

test('HtmlToPdf execute - converts HTML string using embedded binary', async () => {
	const node = new HtmlToPdf();

	const mockExecuteFunctions: any = {
		getInputData() {
			return [{ json: { invoiceId: 'INV-2026-001' } }];
		},
		getNodeParameter(name: string, _itemIndex: number, fallback?: any) {
			const params: Record<string, any> = {
				sourceType: 'html',
				html: '<h1>Invoice #INV-2026-001</h1><p>Converted with sghtmltopdf.</p>',
				dataPropertyName: 'data',
				fileName: 'invoice.pdf',
				mode: 'cli',
				binaryPath: '',
				options: {
					pageSize: 'A4',
					title: 'Invoice Document',
				},
			};
			return params[name] !== undefined ? params[name] : fallback;
		},
		helpers: {
			async prepareBinaryData(buffer: Buffer, fileName: string, mimeType: string) {
				return {
					data: buffer.toString('base64'),
					mimeType,
					fileName,
					fileSize: `${buffer.length} B`,
				};
			},
		},
		getNode() {
			return { name: 'htmlToPdf' };
		},
		continueOnFail() {
			return false;
		},
	};

	const results = await node.execute.call(mockExecuteFunctions);
	assert.strictEqual(results.length, 1);
	assert.strictEqual(results[0].length, 1);

	const item = results[0][0];
	assert.ok(item.binary);
	assert.ok(item.binary!.data);
	assert.strictEqual(item.binary!.data.fileName, 'invoice.pdf');
	assert.strictEqual(item.binary!.data.mimeType, 'application/pdf');

	const decoded = Buffer.from(item.binary!.data.data, 'base64');
	assert.strictEqual(decoded.subarray(0, 5).toString('ascii'), '%PDF-');
	assert.strictEqual(item.json.invoiceId, 'INV-2026-001');
	assert.ok(item.json.htmlToPdf);
	assert.strictEqual((item.json.htmlToPdf as any).success, true);
});

test('HtmlToPdf execute - fetches and converts URL', async () => {
	// Create mock web server
	const server = http.createServer((req, res) => {
		res.writeHead(200, { 'Content-Type': 'text/html' });
		res.end('<!DOCTYPE html><html><body><h1>Web Page Heading</h1></body></html>');
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
	const address = server.address() as { port: number };
	const pageUrl = `http://127.0.0.1:${address.port}/page`;

	try {
		const node = new HtmlToPdf();

		const mockExecuteFunctions: any = {
			getInputData() {
				return [{ json: { target: pageUrl } }];
			},
			getNodeParameter(name: string, _itemIndex: number, fallback?: any) {
				const params: Record<string, any> = {
					sourceType: 'url',
					url: pageUrl,
					dataPropertyName: 'data',
					fileName: 'webpage.pdf',
					mode: 'cli',
					options: {},
				};
				return params[name] !== undefined ? params[name] : fallback;
			},
			helpers: {
				async prepareBinaryData(buffer: Buffer, fileName: string, mimeType: string) {
					return {
						data: buffer.toString('base64'),
						mimeType,
						fileName,
					};
				},
			},
			getNode() {
				return { name: 'htmlToPdf' };
			},
			continueOnFail() {
				return false;
			},
		};

		const results = await node.execute.call(mockExecuteFunctions);
		const item = results[0][0];
		assert.ok(item.binary!.data);
		const decoded = Buffer.from(item.binary!.data.data, 'base64');
		assert.strictEqual(decoded.subarray(0, 5).toString('ascii'), '%PDF-');
	} finally {
		server.close();
	}
});

test('HtmlToPdf execute - respects continueOnFail on failure', async () => {
	const node = new HtmlToPdf();

	const mockExecuteFunctions: any = {
		getInputData() {
			return [{ json: { badInput: true } }];
		},
		getNodeParameter(name: string, _itemIndex: number, fallback?: any) {
			const params: Record<string, any> = {
				sourceType: 'url',
				url: 'http://127.0.0.1:59998/does-not-exist',
				dataPropertyName: 'data',
				fileName: 'fail.pdf',
				mode: 'cli',
				options: {},
			};
			return params[name] !== undefined ? params[name] : fallback;
		},
		helpers: {
			async prepareBinaryData() {},
		},
		getNode() {
			return { name: 'htmlToPdf' };
		},
		continueOnFail() {
			return true;
		},
	};

	const results = await node.execute.call(mockExecuteFunctions);
	assert.strictEqual(results.length, 1);
	assert.strictEqual(results[0].length, 1);
	assert.ok(results[0][0].json.error);
	assert.strictEqual(results[0][0].json.badInput, true);
});

