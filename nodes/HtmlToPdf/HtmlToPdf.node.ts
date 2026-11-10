import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import {
	resolveBinaryPath,
	runSgHtmlToPdfCli,
	runSgHtmlToPdfServer,
} from '../SgHtmlToPdf/SgHtmlToPdf.node';

export { resolveBinaryPath, runSgHtmlToPdfCli, runSgHtmlToPdfServer };

/**
 * Helper to fetch HTML from a given URL using Node's standard http/https modules.
 */
function fetchHtmlFromUrl(targetUrl: string, timeoutMs: number = 30000): Promise<string> {
	return new Promise((resolve, reject) => {
		let parsedUrl: URL;
		try {
			parsedUrl = new URL(targetUrl);
		} catch (e: any) {
			return reject(new Error(`Invalid URL "${targetUrl}": ${e.message}`));
		}

		const isHttps = parsedUrl.protocol === 'https:';
		const client = isHttps ? https : http;

		const req = client.get(
			targetUrl,
			{
				headers: {
					'User-Agent': 'Mozilla/5.0 (compatible; n8n-nodes-html2pdf-converter/2.0)',
					Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				},
				timeout: timeoutMs,
			},
			(res) => {
				// Handle redirects (301, 302, 307, 308)
				if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
					const redirectUrl = new URL(res.headers.location, targetUrl).toString();
					return resolve(fetchHtmlFromUrl(redirectUrl, timeoutMs));
				}

				if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
					return reject(new Error(`Failed to fetch HTML from URL "${targetUrl}": HTTP ${res.statusCode} ${res.statusMessage || ''}`));
				}

				const chunks: Buffer[] = [];
				res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
				res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
			}
		);

		req.on('timeout', () => {
			req.destroy();
			reject(new Error(`Fetching URL "${targetUrl}" timed out after ${timeoutMs / 1000} seconds`));
		});

		req.on('error', (err) => reject(new Error(`Network error fetching URL "${targetUrl}": ${err.message}`)));
	});
}

export class HtmlToPdf implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'HTML to PDF',
		name: 'htmlToPdf',
		icon: 'file:htmltopdf.svg',
		group: ['transform'],
		version: [1, 2],
		subtitle: '={{$parameter["mode"] === "server" ? "Server: " + $parameter["serverUrl"] : "Plug & Play (Embedded)"}}',
		description: 'Convert HTML, URLs, or dynamic templates into production-grade PDF documents with modern CSS and zero browser overhead',
		defaults: {
			name: 'HTML to PDF',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		properties: [
			// Source Type (backward compatible with v1: 'html' | 'url', plus 'binary')
			{
				displayName: 'Source Type',
				name: 'sourceType',
				type: 'options',
				options: [
					{
						name: 'HTML String',
						value: 'html',
						description: 'Provide HTML directly via expression or editor',
					},
					{
						name: 'Binary File',
						value: 'binary',
						description: 'Read HTML from an incoming binary property',
					},
					{
						name: 'URL',
						value: 'url',
						description: 'Fetch HTML from an HTTP / HTTPS web page URL',
					},
				],
				default: 'html',
				description: 'Whether to provide an HTML string, a binary property, or a URL to convert',
			},
			{
				displayName: 'HTML',
				name: 'html',
				type: 'string',
				typeOptions: {
					rows: 10,
					editor: 'htmlEditor',
				},
				displayOptions: {
					show: {
						sourceType: ['html'],
					},
				},
				default: '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <title>Document</title>\n  <style>\n    body { font-family: sans-serif; margin: 40px; color: #333; }\n    h1 { color: #1a56db; }\n  </style>\n</head>\n<body>\n  <h1>Document Title</h1>\n  <p>Rendered with sghtmltopdf (Plug &amp; Play).</p>\n</body>\n</html>',
				description: 'The HTML string to convert to PDF. Supports expressions and CSS styling.',
			},
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				displayOptions: {
					show: {
						sourceType: ['url'],
					},
				},
				default: '',
				placeholder: 'https://example.com/invoice',
				description: 'The URL of the webpage to convert to PDF',
			},
			{
				displayName: 'Input Binary Property',
				name: 'inputBinaryProperty',
				type: 'string',
				displayOptions: {
					show: {
						sourceType: ['binary'],
					},
				},
				default: 'data',
				description: 'Name of the binary property containing the input HTML file',
			},

			// Output property name (backward compatible with v1: 'dataPropertyName')
			{
				displayName: 'Property Name',
				name: 'dataPropertyName',
				type: 'string',
				default: 'data',
				description: 'Name of the binary property to which to write the data of the generated PDF',
			},
			{
				displayName: 'File Name',
				name: 'fileName',
				type: 'string',
				default: 'document.pdf',
				description: 'File name assigned to the generated PDF binary data',
			},

			// Execution Mode (default: embedded plug-and-play CLI binary)
			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				options: [
					{
						name: 'Plug & Play (Embedded Binary)',
						value: 'cli',
						description: 'Uses the self-contained sghtmltopdf binary packed inside this node (zero setup, no server needed)',
					},
					{
						name: 'External HTTP Server',
						value: 'server',
						description: 'Connect to an external sghtmltopdf HTTP server instance (optional)',
					},
				],
				default: 'cli',
				description: 'How to invoke sghtmltopdf for PDF conversion',
			},
			{
				displayName: 'Custom Binary Path',
				name: 'binaryPath',
				type: 'string',
				displayOptions: {
					show: {
						mode: ['cli'],
					},
				},
				default: '',
				placeholder: 'Auto-detected embedded binary',
				description: 'Optional: override with a custom binary path. Leave blank to automatically use the embedded binary bundled with this node.',
			},
			{
				displayName: 'Server URL',
				name: 'serverUrl',
				type: 'string',
				displayOptions: {
					show: {
						mode: ['server'],
					},
				},
				default: 'http://localhost:8080',
				placeholder: 'http://localhost:8080',
				description: 'Base URL of an external sghtmltopdf HTTP server',
			},

			// Additional Options Collection (with standard page size, orientation, and allow remote assets active by default)
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {
					pageSize: 'A4',
					orientation: 'Portrait',
					allowRemoteAssets: true,
				},
				options: [
					// Page Setup
					{
						displayName: 'Page Size',
						name: 'pageSize',
						type: 'options',
						options: [
							{ name: 'A4', value: 'A4' },
							{ name: 'Letter', value: 'Letter' },
							{ name: 'Legal', value: 'Legal' },
							{ name: 'Tabloid', value: 'Tabloid' },
							{ name: 'A0', value: 'A0' },
							{ name: 'A1', value: 'A1' },
							{ name: 'A2', value: 'A2' },
							{ name: 'A3', value: 'A3' },
							{ name: 'A5', value: 'A5' },
							{ name: 'A6', value: 'A6' },
							{ name: 'B0', value: 'B0' },
							{ name: 'B1', value: 'B1' },
							{ name: 'B2', value: 'B2' },
							{ name: 'B3', value: 'B3' },
							{ name: 'B4', value: 'B4' },
							{ name: 'B5', value: 'B5' },
							{ name: 'Custom', value: 'custom' },
						],
						default: 'A4',
						description: 'Standard paper size',
					},
					{
						displayName: 'Page Width',
						name: 'pageWidth',
						type: 'string',
						default: '',
						placeholder: '210mm or 8.5in',
						description: 'Paper width with units (mm, cm, in, pt, px). Overrides Page Size.',
					},
					{
						displayName: 'Page Height',
						name: 'pageHeight',
						type: 'string',
						default: '',
						placeholder: '297mm or 11in',
						description: 'Paper height with units (mm, cm, in, pt, px). Overrides Page Size.',
					},
					{
						displayName: 'Orientation',
						name: 'orientation',
						type: 'options',
						options: [
							{ name: 'Portrait', value: 'Portrait' },
							{ name: 'Landscape', value: 'Landscape' },
						],
						default: 'Portrait',
						description: 'Paper orientation',
					},
					{
						displayName: 'Margin Top',
						name: 'marginTop',
						type: 'string',
						default: '',
						placeholder: '20mm or 1in',
						description: 'Top page margin (e.g. 20mm, 1in, 0). Author @page CSS wins if set.',
					},
					{
						displayName: 'Margin Bottom',
						name: 'marginBottom',
						type: 'string',
						default: '',
						placeholder: '20mm or 1in',
						description: 'Bottom page margin',
					},
					{
						displayName: 'Margin Left',
						name: 'marginLeft',
						type: 'string',
						default: '',
						placeholder: '20mm or 1in',
						description: 'Left page margin',
					},
					{
						displayName: 'Margin Right',
						name: 'marginRight',
						type: 'string',
						default: '',
						placeholder: '20mm or 1in',
						description: 'Right page margin',
					},
					{
						displayName: 'Zoom Factor',
						name: 'zoom',
						type: 'number',
						typeOptions: {
							minValue: 0.1,
							maxValue: 10.0,
							numberPrecision: 2,
						},
						default: 1.0,
						description: 'Scale factor for rendering (default 1.0)',
					},
					{
						displayName: 'DPI',
						name: 'dpi',
						type: 'number',
						default: 96,
						description: 'What DPI a CSS px represents (default 96; 72 makes 1px = 1pt)',
					},

					// Appearance
					{
						displayName: 'Grayscale',
						name: 'grayscale',
						type: 'boolean',
						default: false,
						description: 'Whether to convert all fill and stroke colours to grayscale',
					},
					{
						displayName: 'No Background',
						name: 'noBackground',
						type: 'boolean',
						default: false,
						description: 'Whether to omit painting element background colours and images',
					},
					{
						displayName: 'No Images',
						name: 'noImages',
						type: 'boolean',
						default: false,
						description: 'Whether to skip loading images',
					},
					{
						displayName: 'No PDF Compression',
						name: 'noPdfCompression',
						type: 'boolean',
						default: false,
						description: 'Whether to disable Flate compression for PDF stream objects',
					},
					{
						displayName: 'Tagged PDF',
						name: 'tagged',
						type: 'boolean',
						default: false,
						description: 'Whether to write a tagged PDF structure tree for screen readers',
					},

					// Headers & Footers
					{
						displayName: 'Header Left',
						name: 'headerLeft',
						type: 'string',
						default: '',
						description: 'Text for left of header. Supports placeholders [page], [pages], [date], [title].',
					},
					{
						displayName: 'Header Center',
						name: 'headerCenter',
						type: 'string',
						default: '',
						description: 'Text for center of header',
					},
					{
						displayName: 'Header Right',
						name: 'headerRight',
						type: 'string',
						default: '',
						description: 'Text for right of header',
					},
					{
						displayName: 'Header Line',
						name: 'headerLine',
						type: 'boolean',
						default: false,
						description: 'Whether to draw a horizontal rule below the header',
					},
					{
						displayName: 'Header Spacing (mm)',
						name: 'headerSpacing',
						type: 'number',
						default: 0,
						description: 'Gap between header and page body in mm',
					},
					{
						displayName: 'Footer Left',
						name: 'footerLeft',
						type: 'string',
						default: '',
						description: 'Text for left of footer. Supports placeholders [page], [pages], [date], [title].',
					},
					{
						displayName: 'Footer Center',
						name: 'footerCenter',
						type: 'string',
						default: '',
						placeholder: 'Page [page] of [pages]',
						description: 'Text for center of footer',
					},
					{
						displayName: 'Footer Right',
						name: 'footerRight',
						type: 'string',
						default: '',
						description: 'Text for right of footer',
					},
					{
						displayName: 'Footer Line',
						name: 'footerLine',
						type: 'boolean',
						default: false,
						description: 'Whether to draw a horizontal rule above the footer',
					},
					{
						displayName: 'Footer Spacing (mm)',
						name: 'footerSpacing',
						type: 'number',
						default: 0,
						description: 'Gap between footer and page body in mm',
					},

					// Table of Contents
					{
						displayName: 'Table of Contents (TOC)',
						name: 'toc',
						type: 'boolean',
						default: false,
						description: 'Whether to generate an automatic Table of Contents based on HTML headings',
					},
					{
						displayName: 'TOC Header Text',
						name: 'tocHeaderText',
						type: 'string',
						default: '',
						placeholder: 'Table of Contents',
						description: 'Title text heading displayed at the top of the Table of Contents',
					},

					// PDF Metadata
					{
						displayName: 'PDF Title',
						name: 'title',
						type: 'string',
						default: '',
						description: 'PDF Document Title (/Title in the PDF Info dictionary)',
					},
					{
						displayName: 'PDF Author',
						name: 'author',
						type: 'string',
						default: '',
						description: 'PDF Document Author (/Author in the PDF Info dictionary)',
					},
					{
						displayName: 'PDF Subject',
						name: 'subject',
						type: 'string',
						default: '',
						description: 'PDF Document Subject (/Subject in the PDF Info dictionary)',
					},
					{
						displayName: 'PDF Keywords',
						name: 'keywords',
						type: 'string',
						default: '',
						description: 'PDF Keywords (/Keywords in the PDF Info dictionary)',
					},
					{
						displayName: 'PDF Creator',
						name: 'creator',
						type: 'string',
						default: 'sghtmltopdf',
						description: 'PDF Creator tool (/Creator in the PDF Info dictionary)',
					},

					// Security & Assets
					{
						displayName: 'Base URL / Directory',
						name: 'baseUrl',
						type: 'string',
						default: '',
						description: 'Base directory or HTTP URL used to resolve relative paths in the HTML (--base-url)',
					},
					{
						displayName: 'Allow Remote Assets',
						name: 'allowRemoteAssets',
						type: 'boolean',
						default: true,
						description: 'Whether to allow fetching remote HTTP/HTTPS images and stylesheets (--allow-remote-assets)',
					},
					{
						displayName: 'Enable Local File Access',
						name: 'enableLocalFileAccess',
						type: 'boolean',
						default: false,
						description: 'Whether to allow HTML to reference local files on the host filesystem (--enable-local-file-access)',
					},

					// Performance
					{
						displayName: 'Streaming Mode',
						name: 'streaming',
						type: 'boolean',
						default: false,
						description: 'Whether to stream HTML reading and page flushing to minimize memory footprint on large documents',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const sourceType = this.getNodeParameter('sourceType', itemIndex, 'html') as 'html' | 'binary' | 'url';
				let htmlBuffer: Buffer;

				if (sourceType === 'html') {
					const html = this.getNodeParameter('html', itemIndex, '') as string;
					htmlBuffer = Buffer.from(html || '', 'utf-8');
				} else if (sourceType === 'url') {
					const url = this.getNodeParameter('url', itemIndex, '') as string;
					if (!url || url.trim().length === 0) {
						throw new Error('URL cannot be empty when Source Type is "URL"');
					}
					const fetchedHtml = await fetchHtmlFromUrl(url.trim());
					htmlBuffer = Buffer.from(fetchedHtml, 'utf-8');
				} else {
					const binaryProp = this.getNodeParameter('inputBinaryProperty', itemIndex, 'data') as string;
					htmlBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryProp);
				}

				if (htmlBuffer.length === 0) {
					throw new Error('Input HTML is empty. Please provide valid HTML content to convert.');
				}

				// Data property name (defaults to 'data')
				const dataPropertyName = this.getNodeParameter('dataPropertyName', itemIndex, 'data') as string;
				const fileName = this.getNodeParameter('fileName', itemIndex, `document_${itemIndex}.pdf`) as string;
				const mode = this.getNodeParameter('mode', itemIndex, 'cli') as 'cli' | 'server';
				const options = this.getNodeParameter('options', itemIndex, {}) as Record<string, any>;

				let pdfBuffer: Buffer;

				if (mode === 'server') {
					const serverUrl = this.getNodeParameter('serverUrl', itemIndex, 'http://localhost:8080') as string;

					// Build query params for server
					const queryParams: Record<string, any> = {};
					queryParams['page-size'] = options.pageSize ? String(options.pageSize) : 'A4';
					if (options.pageWidth) queryParams['page-width'] = options.pageWidth;
					if (options.pageHeight) queryParams['page-height'] = options.pageHeight;
					queryParams['orientation'] = options.orientation ? String(options.orientation) : 'Portrait';

					// Default margins to 0 to prevent squeezing content into legacy 1-inch white borders
					queryParams['margin-top'] = options.marginTop !== undefined && options.marginTop !== '' ? options.marginTop : '0';
					queryParams['margin-bottom'] = options.marginBottom !== undefined && options.marginBottom !== '' ? options.marginBottom : '0';
					queryParams['margin-left'] = options.marginLeft !== undefined && options.marginLeft !== '' ? options.marginLeft : '0';
					queryParams['margin-right'] = options.marginRight !== undefined && options.marginRight !== '' ? options.marginRight : '0';

					if (options.zoom !== undefined) queryParams['zoom'] = options.zoom;
					if (options.dpi !== undefined) queryParams['dpi'] = options.dpi;
					if (options.grayscale) queryParams['grayscale'] = '1';
					if (options.noBackground) queryParams['no-background'] = '1';
					if (options.noImages) queryParams['no-images'] = '1';
					if (options.noPdfCompression) queryParams['no-pdf-compression'] = '1';
					if (options.tagged) queryParams['tagged'] = '1';
					if (options.title) queryParams['title'] = options.title;
					if (options.author) queryParams['author'] = options.author;
					if (options.subject) queryParams['subject'] = options.subject;
					if (options.keywords) queryParams['keywords'] = options.keywords;
					if (options.creator) queryParams['creator'] = options.creator;
					if (options.headerLeft) queryParams['header-left'] = options.headerLeft;
					if (options.headerCenter) queryParams['header-center'] = options.headerCenter;
					if (options.headerRight) queryParams['header-right'] = options.headerRight;
					if (options.headerLine) queryParams['header-line'] = '1';
					if (options.headerSpacing !== undefined) queryParams['header-spacing'] = options.headerSpacing;
					if (options.footerLeft) queryParams['footer-left'] = options.footerLeft;
					if (options.footerCenter) queryParams['footer-center'] = options.footerCenter;
					if (options.footerRight) queryParams['footer-right'] = options.footerRight;
					if (options.footerLine) queryParams['footer-line'] = '1';
					if (options.footerSpacing !== undefined) queryParams['footer-spacing'] = options.footerSpacing;
					if (options.toc) queryParams['toc'] = '1';
					if (options.tocHeaderText) queryParams['toc-header-text'] = options.tocHeaderText;
					if (options.streaming) queryParams['streaming'] = '1';

					pdfBuffer = await runSgHtmlToPdfServer(serverUrl, queryParams, htmlBuffer);
				} else {
					const customBinaryPath = this.getNodeParameter('binaryPath', itemIndex, '') as string;
					const binaryPath = resolveBinaryPath(customBinaryPath);

					const cliArgs: string[] = [];
					cliArgs.push('--page-size', options.pageSize ? String(options.pageSize) : 'A4');
					if (options.pageWidth) cliArgs.push('--page-width', String(options.pageWidth));
					if (options.pageHeight) cliArgs.push('--page-height', String(options.pageHeight));
					cliArgs.push('--orientation', options.orientation ? String(options.orientation) : 'Portrait');

					// Default margins to 0 to prevent squeezing content into legacy 1-inch white borders
					cliArgs.push('--margin-top', options.marginTop !== undefined && options.marginTop !== '' ? String(options.marginTop) : '0');
					cliArgs.push('--margin-bottom', options.marginBottom !== undefined && options.marginBottom !== '' ? String(options.marginBottom) : '0');
					cliArgs.push('--margin-left', options.marginLeft !== undefined && options.marginLeft !== '' ? String(options.marginLeft) : '0');
					cliArgs.push('--margin-right', options.marginRight !== undefined && options.marginRight !== '' ? String(options.marginRight) : '0');

					if (options.zoom !== undefined) cliArgs.push('--zoom', String(options.zoom));
					if (options.dpi !== undefined) cliArgs.push('--dpi', String(options.dpi));
					if (options.grayscale) cliArgs.push('--grayscale');
					if (options.noBackground) cliArgs.push('--no-background');
					if (options.noImages) cliArgs.push('--no-images');
					if (options.noPdfCompression) cliArgs.push('--no-pdf-compression');
					if (options.tagged) cliArgs.push('--tagged');
					if (options.title) cliArgs.push('--title', String(options.title));
					if (options.author) cliArgs.push('--author', String(options.author));
					if (options.subject) cliArgs.push('--subject', String(options.subject));
					if (options.keywords) cliArgs.push('--keywords', String(options.keywords));
					if (options.creator) cliArgs.push('--creator', String(options.creator));
					if (options.headerLeft) cliArgs.push('--header-left', String(options.headerLeft));
					if (options.headerCenter) cliArgs.push('--header-center', String(options.headerCenter));
					if (options.headerRight) cliArgs.push('--header-right', String(options.headerRight));
					if (options.headerLine) cliArgs.push('--header-line');
					if (options.headerSpacing !== undefined) cliArgs.push('--header-spacing', String(options.headerSpacing));
					if (options.footerLeft) cliArgs.push('--footer-left', String(options.footerLeft));
					if (options.footerCenter) cliArgs.push('--footer-center', String(options.footerCenter));
					if (options.footerRight) cliArgs.push('--footer-right', String(options.footerRight));
					if (options.footerLine) cliArgs.push('--footer-line');
					if (options.footerSpacing !== undefined) cliArgs.push('--footer-spacing', String(options.footerSpacing));
					if (options.toc) cliArgs.push('--toc');
					if (options.tocHeaderText) cliArgs.push('--toc-header-text', String(options.tocHeaderText));
					if (options.streaming) cliArgs.push('--streaming');
					if (options.baseUrl) cliArgs.push('--base-url', String(options.baseUrl));

					// Allow remote assets by default (e.g. for external images/stylesheets)
					const allowRemote = options.allowRemoteAssets !== undefined ? Boolean(options.allowRemoteAssets) : true;
					if (allowRemote) {
						cliArgs.push('--allow-remote-assets');
					}
					if (options.enableLocalFileAccess) cliArgs.push('--enable-local-file-access');

					// Read from stdin, write to stdout
					cliArgs.push('-', '-o', '-');

					pdfBuffer = await runSgHtmlToPdfCli(binaryPath, cliArgs, htmlBuffer);
				}

				const binaryData = await this.helpers.prepareBinaryData(pdfBuffer, fileName, 'application/pdf');

				const newItem: INodeExecutionData = {
					json: {
						...items[itemIndex].json,
						htmlToPdf: {
							success: true,
							fileName,
							fileSize: pdfBuffer.length,
							mode,
						},
					},
					binary: {
						...(items[itemIndex].binary || {}),
						[dataPropertyName]: binaryData,
					},
					pairedItem: itemIndex,
				};

				returnData.push(newItem);
			} catch (error: any) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
							...items[itemIndex].json,
						},
						pairedItem: itemIndex,
					});
				} else {
					if (error.context) {
						error.context.itemIndex = itemIndex;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error, { itemIndex });
				}
			}
		}

		return [returnData];
	}
}

