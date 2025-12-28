/**
 * Terminal Output Utilities
 */

import chalk from 'chalk';
import ora, { Ora } from 'ora';

/**
 * ASCII Art Banner for Quantish
 * Yellow/gold gradient style
 */
const BANNER = `
${chalk.yellow('  ██████╗ ')}${chalk.hex('#FFD700')('██╗   ██╗')}${chalk.hex('#FFC000')(' █████╗ ')}${chalk.hex('#FFB000')('███╗   ██╗')}${chalk.hex('#FFA000')('████████╗')}${chalk.hex('#FF9000')('██╗')}${chalk.hex('#FF8000')('███████╗')}${chalk.hex('#FF7000')('██╗  ██╗')}
${chalk.yellow('  ██╔═══██╗')}${chalk.hex('#FFD700')('██║   ██║')}${chalk.hex('#FFC000')('██╔══██╗')}${chalk.hex('#FFB000')('████╗  ██║')}${chalk.hex('#FFA000')('╚══██╔══╝')}${chalk.hex('#FF9000')('██║')}${chalk.hex('#FF8000')('██╔════╝')}${chalk.hex('#FF7000')('██║  ██║')}
${chalk.yellow('  ██║   ██║')}${chalk.hex('#FFD700')('██║   ██║')}${chalk.hex('#FFC000')('███████║')}${chalk.hex('#FFB000')('██╔██╗ ██║')}${chalk.hex('#FFA000')('   ██║   ')}${chalk.hex('#FF9000')('██║')}${chalk.hex('#FF8000')('███████╗')}${chalk.hex('#FF7000')('███████║')}
${chalk.yellow('  ██║▄▄ ██║')}${chalk.hex('#FFD700')('██║   ██║')}${chalk.hex('#FFC000')('██╔══██║')}${chalk.hex('#FFB000')('██║╚██╗██║')}${chalk.hex('#FFA000')('   ██║   ')}${chalk.hex('#FF9000')('██║')}${chalk.hex('#FF8000')('╚════██║')}${chalk.hex('#FF7000')('██╔══██║')}
${chalk.yellow('  ╚██████╔╝')}${chalk.hex('#FFD700')('╚██████╔╝')}${chalk.hex('#FFC000')('██║  ██║')}${chalk.hex('#FFB000')('██║ ╚████║')}${chalk.hex('#FFA000')('   ██║   ')}${chalk.hex('#FF9000')('██║')}${chalk.hex('#FF8000')('███████║')}${chalk.hex('#FF7000')('██║  ██║')}
${chalk.yellow('   ╚══▀▀═╝ ')}${chalk.hex('#FFD700')(' ╚═════╝ ')}${chalk.hex('#FFC000')('╚═╝  ╚═╝')}${chalk.hex('#FFB000')('╚═╝  ╚═══╝')}${chalk.hex('#FFA000')('   ╚═╝   ')}${chalk.hex('#FF9000')('╚═╝')}${chalk.hex('#FF8000')('╚══════╝')}${chalk.hex('#FF7000')('╚═╝  ╚═╝')}
`;

const TAGLINE = chalk.dim('  AI-powered trading agent for Polymarket');

/**
 * Print the header with ASCII art
 */
export function printHeader(): void {
  console.log(BANNER);
  console.log(TAGLINE);
  console.log();
}

/**
 * Print a simple header (no ASCII art)
 */
export function printSimpleHeader(): void {
  console.log();
  console.log(chalk.yellow.bold('┌─────────────────────────────────────┐'));
  console.log(chalk.yellow.bold('│') + '       ' + chalk.yellow.bold('QUANTISH') + '                      ' + chalk.yellow.bold('│'));
  console.log(chalk.yellow.bold('│') + chalk.dim('  AI Trading Agent for Polymarket  ') + chalk.yellow.bold('│'));
  console.log(chalk.yellow.bold('└─────────────────────────────────────┘'));
  console.log();
}

/**
 * Print a divider
 */
export function printDivider(): void {
  console.log(chalk.dim('─'.repeat(40)));
}

/**
 * Print an info message
 */
export function info(message: string): void {
  console.log(chalk.blue('ℹ') + ' ' + message);
}

/**
 * Print a success message
 */
export function success(message: string): void {
  console.log(chalk.green('✓') + ' ' + message);
}

/**
 * Print a warning message
 */
export function warn(message: string): void {
  console.log(chalk.yellow('⚠') + ' ' + message);
}

/**
 * Print an error message
 */
export function error(message: string): void {
  console.log(chalk.red('✗') + ' ' + message);
}

/**
 * Print tool call info
 */
export function toolCall(name: string, args?: Record<string, unknown>): void {
  console.log(chalk.yellow('⚡') + ' ' + chalk.dim('Calling ') + chalk.yellow.bold(name));
  if (args && Object.keys(args).length > 0) {
    console.log(chalk.dim('   ' + JSON.stringify(args)));
  }
}

/**
 * Print assistant response
 */
export function assistant(message: string): void {
  console.log();
  console.log(chalk.yellow('Quantish:'));
  console.log(message);
  console.log();
}

/**
 * Create a spinner
 */
export function spinner(text: string): Ora {
  return ora({
    text,
    color: 'yellow',
  });
}

/**
 * Format currency
 */
export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `$${num.toFixed(2)}`;
}

/**
 * Format percentage
 */
export function formatPercent(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `${(num * 100).toFixed(1)}%`;
}

/**
 * Format address (truncate)
 */
export function formatAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Print a key-value pair
 */
export function keyValue(key: string, value: string | number): void {
  console.log(chalk.dim(key + ':') + ' ' + value);
}

/**
 * Print a table row
 */
export function tableRow(label: string, value: string, width = 20): void {
  const paddedLabel = label.padEnd(width);
  console.log(chalk.dim(paddedLabel) + value);
}
