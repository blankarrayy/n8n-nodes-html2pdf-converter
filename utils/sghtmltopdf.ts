import * as http from 'http';
import * as https from 'https';
import { spawn, ChildProcess } from 'child_process';
import { URL, URLSearchParams } from 'url';

export interface SgHtmlToPdfOptions {
	// Page Setup
	pageSize?: string;
	pageWidth?: string;
	pageHeight?: string;
	orientation?: 'portrait' | 'landscape';
	marginTop?: string;
	marginBottom?: string;
	marginLeft?: string;
	marginRight?: string;
	zoom?: number;
	dpi?: number;
	pageOffset?: number;
	minimumFontSize?: number;

	// Output Appearance
	grayscale?: boolean;
	noBackground?: boolean;
	noImages?: boolean;
	noPdfCompression?: boolean;
	tagged?: boolean;

	// PDF Metadata
	title?: string;
	author?: string;
	subject?: string;
	keywords?: string;
	creator?: string;

	// Headers & Footers
	headerLeft?: string;
	headerCenter?: string;
	headerRight?: string;
	headerFontName?: string;
	headerFontSize?: number;
	headerSpacing?: number;
	headerLine?: boolean;
	footerLeft?: string;
	footerCenter?: string;
	footerRight?: string;
	footerFontName?: string;
	footerFontSize?: number;
	footerSpacing?: number;
	footerLine?: boolean;
	headerHtmlContent?: string;
	footerHtmlContent?: string;

	// Table of Contents
	toc?: boolean;
	tocHeaderText?: string;
	tocLevelIndentation?: string;
	tocTextSizeShrink?: number;
	disableDottedLines?: boolean;
	disableTocLinks?: boolean;
	enableTocBackLinks?: boolean;

	// Links
	disableExternalLinks?: boolean;
	disableInternalLinks?: boolean;
	keepRelativeLinks?: boolean;

	// Engine
	encoding?: string;
	streaming?: boolean;
}

export interface SgHtmlToPdfCliOptions {
	executablePath?: string;
	baseUrl?: string;
	allowRemoteAssets?: boolean;
	enableLocalFileAccess?: boolean;
	customArgs?: string;
	timeout?: number;
}

export interface SgHtmlToPdfServerOptions {
	serverUrl?: string;
	streamResponse?: boolean;
	timeout?: number;
}

export const OPTION_KEY_MAP: Record<keyof SgHtmlToPdfOptions, string> = {
	pageSize: 'page-size',
	pageWidth: 'page-width',
	pageHeight: 'page-height',
	orientation: 'orientation',
	marginTop: 'margin-top',
	marginBottom: 'margin-bottom',
	marginLeft: 'margin-left',
	marginRight: 'margin-right',
	zoom: 'zoom',
	dpi: 'dpi',
	pageOffset: 'page-offset',
	minimumFontSize: 'minimum-font-size',
	grayscale: 'grayscale',
	noBackground: 'no-background',
	noImages: 'no-images',
	noPdfCompression: 'no-pdf-compression',
	tagged: 'tagged',
	title: 'title',
	author: 'author',
	subject: 'subject',
	keywords: 'keywords',
	creator: 'creator',
	headerLeft: 'header-left',
	headerCenter: 'header-center',
	headerRight: 'header-right',
	headerFontName: 'header-font-name',
	headerFontSize: 'header-font-size',
	headerSpacing: 'header-spacing',
	headerLine: 'header-line',
	footerLeft: 'footer-left',
	footerCenter: 'footer-center',
	footerRight: 'footer-right',
	footerFontName: 'footer-font-name',
	footerFontSize: 'footer-font-size',
	footerSpacing: 'footer-spacing',
	footerLine: 'footer-line',
	headerHtmlContent: 'header-html-content',
	footerHtmlContent: 'footer-html-content',
	toc: 'toc',
	tocHeaderText: 'toc-header-text',
	tocLevelIndentation: 'toc-level-indentation',
	tocTextSizeShrink: 'toc-text-size-shrink',
	disableDottedLines: 'disable-dotted-lines',
	disableTocLinks: 'disable-toc-links',
	enableTocBackLinks: 'enable-toc-back-links',
	disableExternalLinks: 'disable-external-links',
	disableInternalLinks: 'disable-internal-links',
	keepRelativeLinks: 'keep-relative-links',
	encoding: 'encoding',
	streaming: 'streaming',
};

/**
 * Parses space-separated arguments into an array, respecting single and double quotes.
 */
export function parseCommandLineArgs(commandLine: string): string[] {
	const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
	const args: string[] = [];
	let match: RegExpExecArray | null;

	while ((match = regex.exec(commandLine)) !== null) {
		if (match[1] !== undefined) {
			args.push(match[1]);
		} else if (match[2] !== undefined) {
			args.push(match[2]);
		} else {
			args.push(match[0]);
		}
	}

	return args;
}

/**
 * Builds the URL search parameters for the sghtmltopdf HTTP server mode (/pdf?...)
 */
export function buildQueryParams(options: SgHtmlToPdfOptions, streamResponse?: boolean): URLSearchParams {
	const params = new URLSearchParams();

	if (streamResponse) {
		params.set('stream', '1');
	}

	for (const [propKey, cliKey] of Object.entries(OPTION_KEY_MAP)) {
		const value = (options as Record<string, unknown>)[propKey];
		if (value === undefined || value === null || value === '') {
			continue;
		}

		if (typeof value === 'boolean') {
			if (value) {
				params.set(cliKey, '1');
			}
		} else {
			params.set(cliKey, String(value));
		}
	}

	if (!params.has('page-size')) params.set('page-size', 'A4');
	if (!params.has('orientation')) params.set('orientation', 'Portrait');
	if (!params.has('margin-top')) params.set('margin-top', '0');
	if (!params.has('margin-bottom')) params.set('margin-bottom', '0');
	if (!params.has('margin-left')) params.set('margin-left', '0');
	if (!params.has('margin-right')) params.set('margin-right', '0');

	return params;
}

/**
 * Builds the command line argument array for the sghtmltopdf CLI executable.
 */
export function buildCliArgs(
	options: SgHtmlToPdfOptions,
	cliOptions?: SgHtmlToPdfCliOptions
): string[] {
	const args: string[] = [];

	for (const [propKey, cliKey] of Object.entries(OPTION_KEY_MAP)) {
		const value = (options as Record<string, unknown>)[propKey];
		if (value === undefined || value === null || value === '') {
			continue;
		}

		if (typeof value === 'boolean') {
			if (value) {
				args.push(`--${cliKey}`);
			}
		} else {
			args.push(`--${cliKey}`, String(value));
		}
	}

	// Standard defaults: A4, Portrait, and 0 margins to prevent squeezed content
	if (!args.includes('--page-size') && !args.includes('--page-width')) {
		args.push('--page-size', 'A4');
	}
	if (!args.includes('--orientation')) {
		args.push('--orientation', 'Portrait');
	}
	if (!args.includes('--margin-top')) {
		args.push('--margin-top', '0');
	}
	if (!args.includes('--margin-bottom')) {
		args.push('--margin-bottom', '0');
	}
	if (!args.includes('--margin-left')) {
		args.push('--margin-left', '0');
	}
	if (!args.includes('--margin-right')) {
		args.push('--margin-right', '0');
	}

	// Allow remote assets by default
	const allowRemote = cliOptions?.allowRemoteAssets !== false;
	if (allowRemote && !args.includes('--allow-remote-assets')) {
		args.push('--allow-remote-assets');
	}

	if (cliOptions) {
		if (cliOptions.baseUrl) {
			args.push('--base-url', cliOptions.baseUrl);
		}
		if (cliOptions.enableLocalFileAccess) {
			args.push('--enable-local-file-access');
		}
		if (cliOptions.customArgs) {
			const parsed = parseCommandLineArgs(cliOptions.customArgs);
			args.push(...parsed);
		}
	}

	// Read input from stdin (-), output to stdout (-)
	args.push('-', '-o', '-');

	// Suppress verbose informational messages on stderr
	args.push('--quiet');

	return args;
}

/**
 * Sends HTML buffer to a running sghtmltopdf HTTP server instance and returns the generated PDF buffer.
 */
export function convertViaServer(
	htmlBuffer: Buffer,
	serverOptions: SgHtmlToPdfServerOptions = {},
	options: SgHtmlToPdfOptions = {}
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const serverUrl = serverOptions.serverUrl || 'http://127.0.0.1:8080';
		const timeout = (serverOptions.timeout || 30) * 1000;
		let parsedUrl: URL;

		try {
			parsedUrl = new URL(serverUrl);
		} catch (err: any) {
			return reject(new Error(`Invalid sghtmltopdf server URL: "${serverUrl}". ${err.message}`));
		}

		const queryParams = buildQueryParams(options, serverOptions.streamResponse);
		const searchString = queryParams.toString();
		const path = `/pdf${searchString ? '?' + searchString : ''}`;

		const isHttps = parsedUrl.protocol === 'https:';
		const client = isHttps ? https : http;
		const defaultPort = isHttps ? 443 : 80;
		const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : defaultPort;

		const req = client.request(
			{
				protocol: parsedUrl.protocol,
				hostname: parsedUrl.hostname,
				port,
				path,
				method: 'POST',
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					'Content-Length': Buffer.byteLength(htmlBuffer),
				},
				timeout,
			},
			(res) => {
				const chunks: Buffer[] = [];

				res.on('data', (chunk: Buffer) => {
					chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
				});

				res.on('end', () => {
					const body = Buffer.concat(chunks);
					const statusCode = res.statusCode || 0;

					if (statusCode >= 200 && statusCode < 300) {
						return resolve(body);
					}

					const errorText = body.toString('utf-8').trim();
					let message = `sghtmltopdf server error (${statusCode} ${res.statusMessage || ''}): ${errorText || 'No error details provided'}`;

					if (statusCode === 400) {
						message = `sghtmltopdf Bad Request (400): ${errorText}. Please verify conversion parameters and HTML validity.`;
					} else if (statusCode === 413) {
						message = `sghtmltopdf Payload Too Large (413): HTML exceeds server maximum body size limit.`;
					} else if (statusCode === 500) {
						message = `sghtmltopdf Render Error (500): ${errorText}`;
					} else if (statusCode === 503) {
						message = `sghtmltopdf Service Unavailable (503): Server request queue is full.`;
					} else if (statusCode === 504) {
						message = `sghtmltopdf Gateway Timeout (504): Conversion timed out on the server.`;
					}

					return reject(new Error(message));
				});
			}
		);

		req.on('timeout', () => {
			req.destroy();
			reject(new Error(`Connection to sghtmltopdf server timed out after ${serverOptions.timeout || 30} seconds.`));
		});

		req.on('error', (err: any) => {
			if (err.code === 'ECONNREFUSED') {
				reject(
					new Error(
						`Could not connect to sghtmltopdf server at ${serverUrl} (ECONNREFUSED). ` +
						`Ensure the server is running (e.g. "docker run -d -p 8080:8080 ghcr.io/waka/sghtmltopdf" or "sghtmltopdf server").`
					)
				);
			} else {
				reject(new Error(`Failed to communicate with sghtmltopdf server: ${err.message}`));
			}
		});

		req.write(htmlBuffer);
		req.end();
	});
}

/**
 * Spawns the sghtmltopdf executable, pipes HTML into stdin, and returns the generated PDF buffer from stdout.
 */
export function convertViaCli(
	htmlBuffer: Buffer,
	cliOptions: SgHtmlToPdfCliOptions = {},
	options: SgHtmlToPdfOptions = {}
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const executablePath = cliOptions.executablePath || 'sghtmltopdf';
		const args = buildCliArgs(options, cliOptions);
		const timeout = (cliOptions.timeout || 30) * 1000;

		let child: ChildProcess;
		try {
			child = spawn(executablePath, args, {
				stdio: ['pipe', 'pipe', 'pipe'],
			});
		} catch (err: any) {
			return reject(new Error(`Failed to spawn sghtmltopdf: ${err.message}`));
		}

		let timeoutId: NodeJS.Timeout | null = null;
		if (timeout > 0) {
			timeoutId = setTimeout(() => {
				child.kill('SIGKILL');
				reject(new Error(`sghtmltopdf CLI execution timed out after ${cliOptions.timeout || 30} seconds.`));
			}, timeout);
		}

		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];

		if (child.stdout) {
			child.stdout.on('data', (chunk: Buffer) => {
				stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
			});
		}

		if (child.stderr) {
			child.stderr.on('data', (chunk: Buffer) => {
				stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
			});
		}

		child.on('error', (err: any) => {
			if (timeoutId) clearTimeout(timeoutId);
			if (err.code === 'ENOENT') {
				reject(
					new Error(
						`sghtmltopdf executable not found at "${executablePath}". ` +
						`Please install sghtmltopdf (https://github.com/waka/sghtmltopdf) and ensure it is in PATH, ` +
						`or configure "Server (HTTP)" mode with the official Docker container ghcr.io/waka/sghtmltopdf.`
					)
				);
			} else {
				reject(new Error(`sghtmltopdf process error: ${err.message}`));
			}
		});

		child.on('close', (code: number | null, signal: string | null) => {
			if (timeoutId) clearTimeout(timeoutId);

			if (code === 0) {
				const pdfBuffer = Buffer.concat(stdoutChunks);
				if (pdfBuffer.length === 0) {
					return reject(new Error('sghtmltopdf completed successfully but emitted 0 bytes of PDF output.'));
				}
				return resolve(pdfBuffer);
			}

			const stderrStr = Buffer.concat(stderrChunks).toString('utf-8').trim();
			const exitInfo = signal ? `killed by signal ${signal}` : `exit code ${code}`;
			reject(new Error(`sghtmltopdf failed (${exitInfo}): ${stderrStr || 'No error details reported on stderr.'}`));
		});

		if (child.stdin) {
			child.stdin.write(htmlBuffer);
			child.stdin.end();
		}
	});
}

