import test from 'node:test';
import assert from 'node:assert';
import * as http from 'node:http';
import {
	SgHtmlToPdf,
	resolveBinaryPath,
	runSgHtmlToPdfCli,
	runSgHtmlToPdfServer,
} from '../nodes/SgHtmlToPdf/SgHtmlToPdf.node';

test('SgHtmlToPdf - Node description has required properties', () => {
	const node = new SgHtmlToPdf();
	assert.strictEqual(node.description.name, 'sgHtmlToPdf');
	assert.strictEqual(node.description.displayName, 'sghtmltopdf');
	assert.strictEqual(node.description.icon, 'file:sghtmltopdf.svg');
	assert.ok(node.description.properties.length > 0);

	const optionsProp = node.description.properties.find((p) => p.name === 'options') as any;
	assert.ok(optionsProp);
	assert.deepStrictEqual(optionsProp.default, {
		pageSize: 'A4',
		orientation: 'Portrait',
		allowRemoteAssets: true,
	});
});

test('resolveBinaryPath - finds binary or falls back correctly', () => {
	const resolved = resolveBinaryPath();
	assert.ok(resolved.length > 0);
	assert.ok(resolved.includes('sghtmltopdf'));
});

test('runSgHtmlToPdfCli - converts HTML to valid PDF via CLI', async () => {
	const binaryPath = resolveBinaryPath();
	const html = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>Test Document</title></head>
  <body><h1>Test Heading</h1><p>Test paragraph content.</p></body>
</html>`;

	const args = ['--page-size', 'A4', '--title', 'Test Document', '-', '-o', '-'];
	const pdfBuffer = await runSgHtmlToPdfCli(binaryPath, args, html);

	assert.ok(Buffer.isBuffer(pdfBuffer));
	assert.ok(pdfBuffer.length > 0);
	// Check PDF magic bytes (%PDF-)
	const magic = pdfBuffer.subarray(0, 5).toString('ascii');
	assert.strictEqual(magic, '%PDF-');
});

test('runSgHtmlToPdfServer - sends POST /pdf with query parameters and handles response', async () => {
	let receivedMethod = '';
	let receivedPath = '';
	let receivedBody = '';

	const server = http.createServer((req, res) => {
		receivedMethod = req.method || '';
		receivedPath = req.url || '';

		const chunks: Buffer[] = [];
		req.on('data', (c) => chunks.push(c));
		req.on('end', () => {
			receivedBody = Buffer.concat(chunks).toString('utf-8');
			res.writeHead(200, { 'Content-Type': 'application/pdf' });
			res.end(Buffer.from('%PDF-1.7 mock pdf content'));
		});
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
	const address = server.address() as { port: number };
	const serverUrl = `http://127.0.0.1:${address.port}`;

	try {
		const html = '<h1>Hello Server</h1>';
		const queryParams = {
			'page-size': 'A4',
			orientation: 'Landscape',
			grayscale: '1',
		};

		const result = await runSgHtmlToPdfServer(serverUrl, queryParams, html);

		assert.strictEqual(receivedMethod, 'POST');
		assert.ok(receivedPath.startsWith('/pdf?'));
		assert.ok(receivedPath.includes('page-size=A4'));
		assert.ok(receivedPath.includes('orientation=Landscape'));
		assert.ok(receivedPath.includes('grayscale=1'));
		assert.strictEqual(receivedBody, html);

		assert.ok(Buffer.isBuffer(result));
		assert.ok(result.toString('ascii').startsWith('%PDF-1.7'));
	} finally {
		server.close();
	}
});

test('SgHtmlToPdf execute - handles items and generates binary data in CLI mode', async () => {
	const node = new SgHtmlToPdf();

	const mockExecuteFunctions: any = {
		getInputData() {
			return [{ json: { myField: 'test1234' } }];
		},
		getNodeParameter(name: string, _itemIndex: number, fallback?: any) {
			const params: Record<string, any> = {
				mode: 'cli',
				htmlSource: 'html',
				htmlContent: '<h1>n8n Node Test</h1><p>Testing execute method.</p>',
				outputBinaryProperty: 'data',
				fileName: 'test-invoice.pdf',
				options: {
					pageSize: 'A4',
					title: 'n8n Test Invoice',
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
			return { name: 'sgHtmlToPdf' };
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
	assert.ok(item.binary.data);
	assert.strictEqual(item.binary.data.fileName, 'test-invoice.pdf');
	assert.strictEqual(item.binary.data.mimeType, 'application/pdf');

	const decodedBuffer = Buffer.from(item.binary.data.data, 'base64');
	assert.ok(decodedBuffer.subarray(0, 5).toString('ascii') === '%PDF-');

	assert.ok(item.json);
	assert.strictEqual(item.json.myField, 'test1234');
	assert.ok(item.json.sghtmltopdf);
	assert.strictEqual((item.json.sghtmltopdf as any).success, true);
	assert.strictEqual((item.json.sghtmltopdf as any).fileName, 'test-invoice.pdf');
});

test('SgHtmlToPdf execute - handles binary HTML input source', async () => {
	const node = new SgHtmlToPdf();

	const mockExecuteFunctions: any = {
		getInputData() {
			return [
				{
					json: { orderId: 999 },
					binary: {
						htmlFile: {
							data: Buffer.from('<h2>Binary Source HTML</h2>').toString('base64'),
							mimeType: 'text/html',
							fileName: 'source.html',
						},
					},
				},
			];
		},
		getNodeParameter(name: string, _itemIndex: number, fallback?: any) {
			const params: Record<string, any> = {
				mode: 'cli',
				htmlSource: 'binary',
				inputBinaryProperty: 'htmlFile',
				outputBinaryProperty: 'pdfDoc',
				fileName: 'receipt.pdf',
				options: {
					orientation: 'Landscape',
				},
			};
			return params[name] !== undefined ? params[name] : fallback;
		},
		helpers: {
			async getBinaryDataBuffer(_itemIndex: number, propertyName: string) {
				assert.strictEqual(propertyName, 'htmlFile');
				return Buffer.from('<h2>Binary Source HTML</h2>', 'utf-8');
			},
			async prepareBinaryData(buffer: Buffer, fileName: string, mimeType: string) {
				return {
					data: buffer.toString('base64'),
					mimeType,
					fileName,
				};
			},
		},
		getNode() {
			return { name: 'sgHtmlToPdf' };
		},
		continueOnFail() {
			return false;
		},
	};

	const results = await node.execute.call(mockExecuteFunctions);
	assert.strictEqual(results.length, 1);
	const item = results[0][0];

	assert.ok(item.binary);
	assert.ok(item.binary!.pdfDoc);
	assert.strictEqual(item.binary!.pdfDoc.fileName, 'receipt.pdf');
	const decoded = Buffer.from(item.binary!.pdfDoc.data, 'base64');
	assert.strictEqual(decoded.subarray(0, 5).toString('ascii'), '%PDF-');
	assert.strictEqual(item.json.orderId, 999);
	assert.strictEqual((item.json.sghtmltopdf as any).success, true);
});

test('SgHtmlToPdf execute - handles server mode execution', async () => {
	const server = http.createServer((req, res) => {
		res.writeHead(200, { 'Content-Type': 'application/pdf' });
		res.end(Buffer.from('%PDF-1.7 server mock pdf'));
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
	const address = server.address() as { port: number };
	const serverUrl = `http://127.0.0.1:${address.port}`;

	try {
		const node = new SgHtmlToPdf();

		const mockExecuteFunctions: any = {
			getInputData() {
				return [{ json: { id: 1 } }];
			},
			getNodeParameter(name: string, _itemIndex: number, fallback?: any) {
				const params: Record<string, any> = {
					mode: 'server',
					serverUrl,
					htmlSource: 'html',
					htmlContent: '<h1>From Server Test</h1>',
					outputBinaryProperty: 'data',
					fileName: 'server-doc.pdf',
					options: {
						pageSize: 'Letter',
						grayscale: true,
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
					};
				},
			},
			getNode() {
				return { name: 'sgHtmlToPdf' };
			},
			continueOnFail() {
				return false;
			},
		};

		const results = await node.execute.call(mockExecuteFunctions);
		const item = results[0][0];
		assert.ok(item.binary);
		assert.ok(item.binary!.data);
		assert.strictEqual(item.binary!.data.fileName, 'server-doc.pdf');
		assert.strictEqual((item.json.sghtmltopdf as any).mode, 'server');
	} finally {
		server.close();
	}
});

test('SgHtmlToPdf execute - respects continueOnFail on error', async () => {
	const node = new SgHtmlToPdf();

	const mockExecuteFunctions: any = {
		getInputData() {
			return [{ json: { willFail: true } }];
		},
		getNodeParameter(name: string, _itemIndex: number, fallback?: any) {
			const params: Record<string, any> = {
				mode: 'server',
				serverUrl: 'http://127.0.0.1:59999', // Non-existent server
				htmlSource: 'html',
				htmlContent: '<h1>Should Fail</h1>',
				outputBinaryProperty: 'data',
				fileName: 'error.pdf',
				options: {},
			};
			return params[name] !== undefined ? params[name] : fallback;
		},
		helpers: {
			async prepareBinaryData() {},
		},
		getNode() {
			return { name: 'sgHtmlToPdf' };
		},
		continueOnFail() {
			return true;
		},
	};

	const results = await node.execute.call(mockExecuteFunctions);
	assert.strictEqual(results.length, 1);
	assert.strictEqual(results[0].length, 1);
	assert.ok(results[0][0].error);
	assert.strictEqual(results[0][0].json.willFail, true);
});
