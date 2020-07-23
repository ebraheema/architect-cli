import crypto from 'crypto';

export const createQueryParams = (params: any) => {
  return Object.keys(params)
    .filter((k) => typeof params[k] !== 'undefined')
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&');
};

export const base64UrlEncode = (str: Buffer) =>
  str
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

export const sha256 = (buffer: crypto.BinaryLike) =>
  crypto.createHash('sha256').update(buffer).digest();

export const getOauthCodeVerifier = (size = 32) =>
  base64UrlEncode(crypto.randomBytes(size));

export const getChallengeForOauthVerifier = (verifier: string) =>
  base64UrlEncode(sha256(verifier));
