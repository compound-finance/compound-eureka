#!env node
import { promisify } from 'util';
import fs from 'fs';
export const fileExists = promisify(fs.exists);

export const readFile = (file) => promisify(fs.readFile)(file, 'utf8');

argv[1]