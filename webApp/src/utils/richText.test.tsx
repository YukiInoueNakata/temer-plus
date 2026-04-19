import { describe, it, expect } from 'vitest';
import { renderRichText, stripTags } from './richText';

describe('stripTags: タグ除去', () => {
  it('プレーンはそのまま', () => {
    expect(stripTags('hello')).toBe('hello');
  });
  it('タグを削除してテキストだけ返す', () => {
    expect(stripTags('これは <b>重要</b> です')).toBe('これは 重要 です');
    expect(stripTags('<color=#cc0000>赤</color>')).toBe('赤');
    expect(stripTags('<b>太<i>斜</i></b>')).toBe('太斜');
  });
  it('空入力は空文字列', () => {
    expect(stripTags(undefined)).toBe('');
    expect(stripTags('')).toBe('');
  });
  it('未知のタグは文字として保持', () => {
    expect(stripTags('a<unknown>b</unknown>c')).toBe('a<unknown>b</unknown>c');
  });
});

describe('renderRichText: React 要素の生成', () => {
  it('undefined / 空文字は null', () => {
    expect(renderRichText(undefined)).toBeNull();
    expect(renderRichText('')).toBeNull();
  });
  it('プレーンテキストを React fragment で返す', () => {
    const result = renderRichText('hello');
    expect(result).toBeTruthy();
  });
  it('縦書きモードでも例外を出さない', () => {
    const result = renderRichText('a-b', { vertical: true });
    expect(result).toBeTruthy();
  });
  it('ネストしたタグが出力できる', () => {
    const result = renderRichText('<b>太<i>斜</i></b>');
    expect(result).toBeTruthy();
  });
});
