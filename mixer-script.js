/**
 * mixer-script.js
 * Deep Token-Level LLM-Style HTML <head> Synthesizer & Strict Parameter Solver
 */
(function (global) {
    'use strict';

    class HeadMixerEngine {
        static rand(arr) {
            if (!arr || arr.length === 0) return '';
            return arr[Math.floor(Math.random() * arr.length)];
        }

        static randInt(min, max) {
            const lo = Math.ceil(Math.min(min, max));
            const hi = Math.floor(Math.max(min, max));
            return Math.floor(Math.random() * (hi - lo + 1)) + lo;
        }

        static shuffle(arr) {
            const copy = [...arr];
            for (let i = copy.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy;
        }

        static parseHeadDocument(rawHtml, doctype = '<!DOCTYPE html>') {
            const ast = {
                doctype: doctype || '<!DOCTYPE html>',
                metas: [],
                titles: [],
                links: [],
                styles: [],
                scripts: [],
                comments: [],
                msoBlocks: []
            };
            if (!rawHtml || typeof rawHtml !== 'string') return ast;

            const docMatch = rawHtml.match(/<!DOCTYPE[^>]*>/i);
            if (docMatch) ast.doctype = docMatch[0];

            let inner = rawHtml;
            const headMatch = rawHtml.match(new RegExp('<head\\b[^>]*>([\\s\\S]*?)<' + '/head>', 'i'));
            if (headMatch) inner = headMatch[1];

            inner = inner.replace(/<!--\[if[^\]]*\][\s\S]*?<!\[endif\]-->/gi, (m) => {
                ast.msoBlocks.push(m.trim());
                return '\n';
            });

            inner = inner.replace(/<!--[\s\S]*?-->/g, (m) => {
                ast.comments.push(m.trim());
                return '\n';
            });

            inner = inner.replace(/<title\b[^>]*>([\s\S]*?)<\/title>/gi, (_, t) => {
                const c = t.replace(/\s+/g, ' ').trim();
                if (c) ast.titles.push(c);
                return '\n';
            });

            inner = inner.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_, attrs, css) => {
                ast.styles.push({
                    attrs: this.parseAttrs(attrs),
                    parsed: this.tokenizeCSS(css)
                });
                return '\n';
            });

            inner = inner.replace(new RegExp('<script\\b([^>]*)>([\\s\\S]*?)<' + '/script>', 'gi'), (_, attrs, body) => {
                ast.scripts.push({
                    attrs: this.parseAttrs(attrs),
                    body: body.trim()
                });
                return '\n';
            });

            inner = inner.replace(/<meta\b([^>]*)\/?>/gi, (_, attrStr) => {
                const attrs = this.parseAttrs(attrStr);
                if (Object.keys(attrs).length > 0) ast.metas.push(attrs);
                return '\n';
            });

            inner = inner.replace(/<(link|base|img)\b([^>]*)\/?>/gi, (_, tag, attrStr) => {
                const attrs = this.parseAttrs(attrStr);
                ast.links.push({ tag: tag.toLowerCase(), attrs });
                return '\n';
            });

            return ast;
        }

        static parseAttrs(str) {
            const attrs = {};
            if (!str) return attrs;
            const regex = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
            let m;
            while ((m = regex.exec(str)) !== null) {
                const key = m[1].toLowerCase();
                const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : true));
                attrs[key] = val;
            }
            return attrs;
        }

        static tokenizeCSS(cssText) {
            const rules = [];
            const mediaBlocks = [];
            const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, '').trim();
            let i = 0;

            while (i < clean.length) {
                const open = clean.indexOf('{', i);
                if (open === -1) break;
                const header = clean.slice(i, open).trim();
                let depth = 1;
                let j = open + 1;
                while (j < clean.length && depth > 0) {
                    if (clean[j] === '{') depth++;
                    else if (clean[j] === '}') depth--;
                    j++;
                }
                const body = clean.slice(open + 1, j - 1).trim();

                if (header.startsWith('@media') || header.startsWith('@supports') || header.startsWith('@keyframes')) {
                    const innerParsed = this.tokenizeCSS(body);
                    mediaBlocks.push({ query: header, rules: innerParsed.rules });
                } else if (header) {
                    const decls = body.split(';').map(d => d.trim()).filter(Boolean).map(d => {
                        const col = d.indexOf(':');
                        if (col === -1) return null;
                        return {
                            prop: d.slice(0, col).trim().toLowerCase(),
                            val: d.slice(col + 1).trim()
                        };
                    }).filter(Boolean);

                    if (decls.length > 0) {
                        rules.push({ selector: header, declarations: decls });
                    }
                }
                i = j;
            }
            return { rules, mediaBlocks };
        }

        static buildCorpus(parsedList) {
            const corpus = {
                doctypes: [],
                titleWords: [],
                titleBigrams: new Map(),
                symbolTokens: ['—', '|', '::', '/', '•', '[', ']', '(', ')', '&'],
                metaAttrKeys: ['charset', 'name', 'content', 'http-equiv', 'property'],
                metaAttrValues: new Map(),
                metaObjects: [],
                linkTags: ['link'],
                linkRels: ['stylesheet', 'preconnect', 'icon', 'preload', 'canonical', 'dns-prefetch', 'apple-touch-icon'],
                linkTypes: ['text/css', 'image/svg+xml', 'image/png', 'font/woff2', 'application/json'],
                linkAs: ['style', 'font', 'image', 'script'],
                protocols: ['https://'],
                domains: ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'assets.mailrouter.io', 'static.edgecdn.net'],
                tlds: ['.com', '.io', '.net', '.org', '.app'],
                paths: ['/mail/v4/', '/assets/styles/', '/email/theme/', '/static/fonts/', '/v2/envelope/'],
                filenames: ['main', 'envelope', 'receipt', 'digest', 'theme', 'brand', 'bundle', 'sprite', 'core', 'layout'],
                extensions: ['.css', '.woff2', '.png', '.svg', '.js', '.json', '.ico'],
                selectors: ['body', '.container', '.card', '.btn', '.header', '.footer', 'table', 'td', 'th', 'tr', 'h1', 'h2', 'p', 'a', '.badge', '.wrapper', '.pill', '.divider'],
                selectorCombinators: [' ', ' > ', ', ', ' + ', ' ~ '],
                pseudoModifiers: ['', ':hover', ':focus', ':first-child', ':last-child'],
                cssProps: ['font-family', 'background', 'background-color', 'color', 'margin', 'padding', 'border-radius', 'max-width', 'width', 'line-height', 'font-size', 'font-weight', 'border', 'box-shadow', 'display', 'text-decoration', 'letter-spacing', 'text-align'],
                cssValues: ['0 auto', '16px', '24px', '12px', '100%', '600px', '1.5', 'none', 'inline-block', 'block', '600', '700', '14px', '0', '10px 18px'],
                cssValueTokens: [],
                hexColors: ['#ffffff', '#0f172a', '#2563eb', '#f8fafc', '#1e293b', '#10b981', '#e2e8f0', '#32325d', '#5e6ad2', '#1f883d'],
                mediaQueries: [
                    '@media only screen and (max-width: 620px)',
                    '@media (prefers-color-scheme: dark)',
                    '@media screen and (max-width: 480px)',
                    '@media only screen and (min-width: 600px)'
                ],
                comments: [
                    '<!-- Synthesized Token Envelope Metadata -->',
                    '<!-- Dynamic Client Rendering Normalization -->',
                    '<!-- Multi-Client Responsive Viewport Guard -->',
                    '<!-- Telemetry & Asset Preload Registry -->'
                ],
                msoBlocks: [
                    '<!--[if mso]>\n<xml>\n<o:OfficeDocumentSettings>\n<o:PixelsPerInch>96</o:PixelsPerInch>\n</o:OfficeDocumentSettings>\n</xml>\n<![endif]-->',
                    '<!--[if gte mso 9]>\n<style type="text/css">\ntable { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }\n</style>\n<![endif]-->',
                    '<!--[if (gte mso 9)|(IE)]>\n<style type="text/css">\n.container { width: 600px !important; }\n</style>\n<![endif]-->'
                ],
                scripts: []
            };

            parsedList.forEach(ast => {
                if (ast.doctype) corpus.doctypes.push(ast.doctype);

                ast.titles.forEach(t => {
                    const rawTokens = t.match(/[a-zA-Z0-9_-]+|[^\s\w]/g) || [];
                    corpus.titleWords.push(...rawTokens);
                    for (let i = 0; i < rawTokens.length - 1; i++) {
                        const w1 = rawTokens[i];
                        const w2 = rawTokens[i + 1];
                        if (!corpus.titleBigrams.has(w1)) corpus.titleBigrams.set(w1, []);
                        corpus.titleBigrams.get(w1).push(w2);
                    }
                });

                ast.metas.forEach(m => {
                    corpus.metaObjects.push(m);
                    Object.entries(m).forEach(([k, v]) => {
                        corpus.metaAttrKeys.push(k);
                        if (typeof v === 'string') {
                            if (!corpus.metaAttrValues.has(k)) corpus.metaAttrValues.set(k, []);
                            corpus.metaAttrValues.get(k).push(v);
                        }
                    });
                });

                ast.links.forEach(l => {
                    corpus.linkTags.push(l.tag);
                    if (l.attrs.rel) corpus.linkRels.push(String(l.attrs.rel));
                    if (l.attrs.type) corpus.linkTypes.push(String(l.attrs.type));
                    if (l.attrs.as) corpus.linkAs.push(String(l.attrs.as));
                    const urlStr = l.attrs.href || l.attrs.src;
                    if (typeof urlStr === 'string') {
                        this.extractUrlTokens(urlStr, corpus);
                    }
                });

                ast.styles.forEach(s => {
                    s.parsed.rules.forEach(r => {
                        corpus.selectors.push(r.selector);
                        r.selector.split(/[\s,>+~]+/).filter(Boolean).forEach(part => corpus.selectors.push(part));
                        r.declarations.forEach(d => {
                            corpus.cssProps.push(d.prop);
                            corpus.cssValues.push(d.val);
                            const hexes = d.val.match(/#[0-9a-fA-F]{3,8}\b/g);
                            if (hexes) corpus.hexColors.push(...hexes);
                            d.val.split(/\s+/).filter(Boolean).forEach(tok => {
                                if (!tok.startsWith('#')) corpus.cssValueTokens.push(tok);
                            });
                        });
                    });
                    s.parsed.mediaBlocks.forEach(mb => {
                        corpus.mediaQueries.push(mb.query);
                        mb.rules.forEach(r => {
                            corpus.selectors.push(r.selector);
                            r.declarations.forEach(d => {
                                corpus.cssProps.push(d.prop);
                                corpus.cssValues.push(d.val);
                            });
                        });
                    });
                });

                ast.comments.forEach(c => corpus.comments.push(c));
                ast.msoBlocks.forEach(m => corpus.msoBlocks.push(m));
                ast.scripts.forEach(sc => corpus.scripts.push(sc));
            });

            if (corpus.cssValueTokens.length === 0) {
                corpus.cssValueTokens.push('12px', '100%', 'solid', '1px', 'auto', '0', 'sans-serif', 'bold', '!important');
            }
            return corpus;
        }

        static extractUrlTokens(urlStr, corpus) {
            try {
                const u = new URL(urlStr, 'https://example.com');
                if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
                    corpus.protocols.push(u.protocol + '//');
                    corpus.domains.push(u.hostname);
                }
                const segments = u.pathname.split('/').filter(Boolean);
                if (segments.length > 1) {
                    corpus.paths.push('/' + segments.slice(0, -1).join('/') + '/');
                }
                const last = segments[segments.length - 1] || '';
                const dotIdx = last.lastIndexOf('.');
                if (dotIdx > 0) {
                    corpus.filenames.push(last.slice(0, dotIdx));
                    corpus.extensions.push(last.slice(dotIdx));
                } else if (last) {
                    corpus.filenames.push(last);
                }
            } catch (e) {}
        }

        static synthesizeUrl(corpus) {
            const proto = this.rand(corpus.protocols);
            let domain = this.rand(corpus.domains);
            if (Math.random() > 0.65 && corpus.domains.length > 1) {
                const d1 = this.rand(corpus.domains).split('.')[0];
                const d2Parts = this.rand(corpus.domains).split('.');
                if (d2Parts.length >= 2) {
                    domain = `${d1}.${d2Parts.slice(-2).join('.')}`;
                }
            }
            const path = this.rand(corpus.paths);
            const file = this.rand(corpus.filenames) + (Math.random() > 0.5 ? '-' + this.rand(corpus.filenames) : '');
            const ext = this.rand(corpus.extensions);
            return `${proto}${domain}${path}${file}${ext}`;
        }

        static mutateHexColor(corpus) {
            const base = this.rand(corpus.hexColors);
            if (/^#[0-9a-fA-F]{6}$/.test(base) && Math.random() > 0.3) {
                const other = this.rand(corpus.hexColors);
                if (/^#[0-9a-fA-F]{6}$/.test(other)) {
                    const r = Math.round((parseInt(base.slice(1, 3), 16) + parseInt(other.slice(1, 3), 16)) / 2).toString(16).padStart(2, '0');
                    const g = Math.round((parseInt(base.slice(3, 5), 16) + parseInt(other.slice(3, 5), 16)) / 2).toString(16).padStart(2, '0');
                    const b = Math.round((parseInt(base.slice(5, 7), 16) + parseInt(other.slice(5, 7), 16)) / 2).toString(16).padStart(2, '0');
                    return `#${r}${g}${b}`;
                }
            }
            return base;
        }

        static synthesizeTitle(corpus) {
            if (corpus.titleWords.length === 0) return 'Synthesized Envelope Notification';
            const targetLen = this.randInt(5, 11);
            let current = this.rand(corpus.titleWords);
            const out = [current];
            for (let i = 1; i < targetLen; i++) {
                const nextCandidates = corpus.titleBigrams.get(current);
                if (nextCandidates && nextCandidates.length > 0 && Math.random() > 0.22) {
                    current = this.rand(nextCandidates);
                } else {
                    current = this.rand(corpus.titleWords);
                }
                out.push(current);
            }
            return out.join(' ').replace(/\s+([,.:;!?\]\)])/g, '$1').replace(/([\[\(])\s+/g, '$1');
        }

        static synthesizeCssValue(prop, corpus) {
            const p = prop.toLowerCase();
            if (p.includes('color') || p === 'background' || p === 'border-color') {
                if (Math.random() > 0.18) return this.mutateHexColor(corpus);
            }
            if (p.includes('border') && Math.random() > 0.35) {
                return `${this.randInt(1, 3)}px solid ${this.mutateHexColor(corpus)}`;
            }
            if (Math.random() > 0.42 && corpus.cssValues.length > 0) {
                let val = this.rand(corpus.cssValues);
                val = val.replace(/#[0-9a-fA-F]{3,8}\b/g, () => this.mutateHexColor(corpus));
                return val;
            }
            const count = this.randInt(1, 3);
            const parts = [];
            for (let i = 0; i < count; i++) {
                parts.push(Math.random() > 0.68 ? this.mutateHexColor(corpus) : this.rand(corpus.cssValueTokens));
            }
            return parts.join(' ');
        }

        static buildCssRule(corpus, declCount = 3) {
            let selector = this.rand(corpus.selectors);
            if (Math.random() > 0.6) {
                selector = `${selector}${this.rand(corpus.selectorCombinators)}${this.rand(corpus.selectors)}`;
            }
            if (Math.random() > 0.78 && !selector.includes(':')) {
                selector += this.rand(corpus.pseudoModifiers);
            }
            const declarations = [];
            const usedProps = new Set();
            for (let i = 0; i < declCount; i++) {
                const prop = this.rand(corpus.cssProps);
                if (usedProps.has(prop) && usedProps.size < corpus.cssProps.length) continue;
                usedProps.add(prop);
                declarations.push({
                    prop,
                    val: this.synthesizeCssValue(prop, corpus)
                });
            }
            return { selector, declarations };
        }

        static countTokens(codeStr) {
            return codeStr.split(/[\s<>;:{}=()"',]+/).filter(Boolean).length;
        }

        static synthesize(selectedHeads, options = {}) {
            const {
                formatMode = 'irregular',
                tokenMin = 100,
                tokenMax = 200,
                linesMin = 50,
                linesMax = 100,
                includeTitle = true,
                includeComments = true,
                favoriteHeads = []
            } = options;

            const enforceTokens = (formatMode === 'irregular' || formatMode === 'none');
            const enforceLines = (formatMode === 'irregular' || formatMode === 'proper');

            const safeTokenMin = Math.max(10, Math.min(tokenMin, tokenMax));
            const safeTokenMax = Math.max(safeTokenMin, tokenMax);
            const safeLinesMin = Math.max(5, Math.min(linesMin, linesMax));
            const safeLinesMax = Math.max(safeLinesMin, linesMax);

            const weightedSources = [...selectedHeads];
            if (favoriteHeads && favoriteHeads.length > 0) {
                favoriteHeads.forEach(fav => weightedSources.push(fav, fav, fav));
            }

            const parsedList = weightedSources.map(h => this.parseHeadDocument(h.html, h.doctype));
            const corpus = this.buildCorpus(parsedList);
            const doctype = this.rand(corpus.doctypes.length ? corpus.doctypes : ['<!DOCTYPE html>']);

            const ast = {
                doctype,
                metas: [],
                title: includeTitle ? this.synthesizeTitle(corpus) : null,
                links: [],
                comments: [],
                msoBlocks: [],
                cssRules: [],
                mediaBlocks: [],
                scripts: []
            };

            const initMetas = this.randInt(2, 4);
            const shuffledMetas = this.shuffle(corpus.metaObjects);
            for (let i = 0; i < initMetas; i++) {
                ast.metas.push(this.generateMetaNode(corpus, shuffledMetas[i]));
            }

            const initLinks = this.randInt(1, 3);
            for (let i = 0; i < initLinks; i++) {
                ast.links.push(this.generateLinkNode(corpus));
            }

            if (includeComments) {
                if (corpus.comments.length > 0) ast.comments.push(this.rand(corpus.comments));
                if (corpus.msoBlocks.length > 0 && Math.random() > 0.3) ast.msoBlocks.push(this.rand(corpus.msoBlocks));
            }

            const initRules = this.randInt(3, 5);
            for (let i = 0; i < initRules; i++) {
                ast.cssRules.push(this.buildCssRule(corpus, this.randInt(2, 4)));
            }

            if (corpus.mediaQueries.length > 0 && Math.random() > 0.35) {
                ast.mediaBlocks.push({
                    query: this.rand(corpus.mediaQueries),
                    rules: [this.buildCssRule(corpus, 2)]
                });
            }

            if (corpus.scripts.length > 0 && Math.random() > 0.45) {
                ast.scripts.push(this.generateScriptNode(corpus));
            }

            let serialized = this.serialize(ast, formatMode);
            let iterations = 0;
            const maxIterations = 260;

            while (iterations < maxIterations) {
                iterations++;
                const curTokens = this.countTokens(serialized);
                const curLines = serialized.split('\n').length;

                const belowTokens = enforceTokens && (curTokens < safeTokenMin);
                const aboveTokens = enforceTokens && (curTokens > safeTokenMax);
                const belowLines = enforceLines && (curLines < safeLinesMin);
                const aboveLines = enforceLines && (curLines > safeLinesMax);

                if (!belowTokens && !aboveTokens && !belowLines && !aboveLines) {
                    break;
                }

                if (belowTokens || belowLines) {
                    if (enforceTokens && curTokens >= safeTokenMax - 12 && belowLines) {
                        this.splitCssRulesForMoreLines(ast);
                    } else if (enforceLines && curLines >= safeLinesMax - 4 && belowTokens) {
                        this.packMoreTokensWithoutLines(ast, corpus);
                    } else {
                        this.expandAst(ast, corpus, includeComments);
                    }
                } else if (aboveTokens || aboveLines) {
                    if (enforceTokens && curTokens <= safeTokenMin + 14 && aboveLines) {
                        const merged = this.mergeCssRulesForFewerLines(ast);
                        if (!merged) this.shrinkAst(ast);
                    } else {
                        const shrunk = this.shrinkAst(ast);
                        if (!shrunk) break;
                    }
                }

                serialized = this.serialize(ast, formatMode);
            }

            serialized = this.enforceStrictClosures(serialized);

            return {
                html: serialized,
                doctype,
                title: ast.title || 'Synthesized Head',
                tokenCount: this.countTokens(serialized),
                lineCount: serialized.split('\n').length,
                sourcesCount: selectedHeads.length
            };
        }

        static generateMetaNode(corpus, templateObj = null) {
            if (templateObj && Math.random() > 0.35) {
                const cloned = { ...templateObj };
                Object.keys(cloned).forEach(k => {
                    const pool = corpus.metaAttrValues.get(k);
                    if (pool && pool.length > 1 && Math.random() > 0.45) {
                        cloned[k] = this.rand(pool);
                    }
                });
                return cloned;
            }
            const key = this.rand(corpus.metaAttrKeys.length ? corpus.metaAttrKeys : ['name']);
            const vals = corpus.metaAttrValues.get(key) || ['utf-8', 'width=device-width, initial-scale=1.0', 'light dark', 'telephone=no'];
            const obj = { [key]: this.rand(vals) };
            if (key === 'name' || key === 'property' || key === 'http-equiv') {
                const contentPool = corpus.metaAttrValues.get('content') || ['width=device-width', 'ie=edge', 'no-cache'];
                obj.content = Math.random() > 0.75 ? this.synthesizeUrl(corpus) : this.rand(contentPool);
            }
            return obj;
        }

        static generateLinkNode(corpus) {
            const rel = this.rand(corpus.linkRels);
            const linkObj = { tag: 'link', attrs: { rel } };
            if (rel === 'preload') linkObj.attrs.as = this.rand(corpus.linkAs);
            if (rel === 'icon' || Math.random() > 0.65) linkObj.attrs.type = this.rand(corpus.linkTypes);
            linkObj.attrs.href = this.synthesizeUrl(corpus);
            return linkObj;
        }

        static generateScriptNode(corpus) {
            if (corpus.scripts.length > 0 && Math.random() > 0.35) {
                const base = this.rand(corpus.scripts);
                return { attrs: { ...base.attrs }, body: base.body };
            }
            return {
                attrs: { type: 'application/ld+json' },
                body: `{"@context":"https://schema.org","@type":"EmailMessage","url":"${this.synthesizeUrl(corpus)}"}`
            };
        }

        static expandAst(ast, corpus, includeComments) {
            const roll = Math.random();
            if (roll < 0.48) {
                if (ast.cssRules.length > 0 && Math.random() > 0.45) {
                    const rule = this.rand(ast.cssRules);
                    const prop = this.rand(corpus.cssProps);
                    rule.declarations.push({
                        prop,
                        val: this.synthesizeCssValue(prop, corpus)
                    });
                } else {
                    ast.cssRules.push(this.buildCssRule(corpus, this.randInt(2, 4)));
                }
            } else if (roll < 0.72) {
                if (Math.random() > 0.5) {
                    ast.links.push(this.generateLinkNode(corpus));
                } else {
                    ast.metas.push(this.generateMetaNode(corpus));
                }
            } else if (roll < 0.88) {
                if (ast.mediaBlocks.length === 0) {
                    ast.mediaBlocks.push({
                        query: this.rand(corpus.mediaQueries),
                        rules: [this.buildCssRule(corpus, 2)]
                    });
                } else {
                    ast.mediaBlocks[0].rules.push(this.buildCssRule(corpus, 2));
                }
            } else if (includeComments && corpus.comments.length > 0) {
                ast.comments.push(this.rand(corpus.comments));
            } else {
                ast.cssRules.push(this.buildCssRule(corpus, 2));
            }
        }

        static packMoreTokensWithoutLines(ast, corpus) {
            if (ast.cssRules.length > 0) {
                const rule = this.rand(ast.cssRules);
                if (rule.declarations.length > 0) {
                    const decl = this.rand(rule.declarations);
                    decl.val = `${decl.val} ${this.rand(corpus.cssValueTokens)}`;
                    return;
                }
            }
            if (ast.links.length > 0) {
                const link = this.rand(ast.links);
                link.attrs['data-token'] = this.rand(corpus.filenames) + '-' + this.rand(corpus.filenames);
            }
        }

        static splitCssRulesForMoreLines(ast) {
            for (let i = 0; i < ast.cssRules.length; i++) {
                const r = ast.cssRules[i];
                if (r.declarations.length > 1) {
                    const moved = r.declarations.pop();
                    ast.cssRules.push({
                        selector: r.selector,
                        declarations: [moved]
                    });
                    return true;
                }
            }
            return false;
        }

        static mergeCssRulesForFewerLines(ast) {
            if (ast.cssRules.length > 1) {
                const tail = ast.cssRules.pop();
                ast.cssRules[0].declarations.push(...tail.declarations);
                return true;
            }
            return false;
        }

        static shrinkAst(ast) {
            if (ast.scripts.length > 0) { ast.scripts.pop(); return true; }
            if (ast.msoBlocks.length > 0) { ast.msoBlocks.pop(); return true; }
            if (ast.mediaBlocks.length > 0) {
                const mb = ast.mediaBlocks[ast.mediaBlocks.length - 1];
                if (mb.rules.length > 1) mb.rules.pop();
                else ast.mediaBlocks.pop();
                return true;
            }
            if (ast.comments.length > 0) { ast.comments.pop(); return true; }
            if (ast.cssRules.length > 0) {
                const lastRule = ast.cssRules[ast.cssRules.length - 1];
                if (lastRule.declarations.length > 1) {
                    lastRule.declarations.pop();
                    return true;
                } else if (ast.cssRules.length > 1) {
                    ast.cssRules.pop();
                    return true;
                }
            }
            if (ast.links.length > 1) { ast.links.pop(); return true; }
            if (ast.metas.length > 1) { ast.metas.pop(); return true; }
            return false;
        }

        static serialize(ast, mode) {
            const getIndent = (level) => {
                if (mode === 'none') return '';
                if (mode === 'proper') return '  '.repeat(level);
                if (Math.random() < 0.36) return '';
                if (Math.random() < 0.55) return '  '.repeat(level);
                const erratic = [1, 3, 4, 5][Math.floor(Math.random() * 4)];
                return ' '.repeat(Math.max(0, (level - 1) * 2 + erratic));
            };

            const formatAttrs = (attrsObj) => {
                return Object.entries(attrsObj).map(([k, v]) => {
                    if (v === true) return k;
                    if (mode === 'irregular' && Math.random() > 0.72) return `${k} = "${v}"`;
                    return `${k}="${v}"`;
                }).join(mode === 'irregular' && Math.random() > 0.75 ? '  ' : ' ');
            };

            const lines = ['<head>'];

            ast.metas.forEach(m => {
                lines.push(`${getIndent(1)}<meta ${formatAttrs(m)}>`);
            });

            if (ast.title) {
                lines.push(`${getIndent(1)}<title>${ast.title}</title>`);
            }

            ast.links.forEach(l => {
                lines.push(`${getIndent(1)}<${l.tag} ${formatAttrs(l.attrs)}>`);
            });

            ast.comments.forEach(c => {
                lines.push(`${getIndent(1)}${c}`);
            });

            ast.msoBlocks.forEach(mso => {
                if (mode === 'none') {
                    lines.push(mso.replace(/\s*\n\s*/g, ''));
                } else {
                    mso.split('\n').forEach(ml => lines.push(`${getIndent(1)}${ml.trim()}`));
                }
            });

            if (ast.cssRules.length > 0 || ast.mediaBlocks.length > 0) {
                lines.push(`${getIndent(1)}<style>`);

                ast.cssRules.forEach(r => {
                    if (mode === 'none') {
                        const decl = r.declarations.map(d => `${d.prop}:${d.val};`).join('');
                        lines.push(`${r.selector}{${decl}}`);
                    } else if (mode === 'irregular' && Math.random() < 0.25) {
                        const decl = r.declarations.map(d => `${d.prop}: ${d.val};`).join(' ');
                        lines.push(`${getIndent(2)}${r.selector} { ${decl} }`);
                    } else {
                        lines.push(`${getIndent(2)}${r.selector} {`);
                        r.declarations.forEach(d => {
                            const sep = (mode === 'irregular' && Math.random() > 0.7) ? ':' : ': ';
                            lines.push(`${getIndent(3)}${d.prop}${sep}${d.val};`);
                        });
                        lines.push(`${getIndent(2)}}`);
                    }
                });

                ast.mediaBlocks.forEach(mb => {
                    if (mode === 'none') {
                        const inner = mb.rules.map(r => `${r.selector}{${r.declarations.map(d => `${d.prop}:${d.val};`).join('')}}`).join('');
                        lines.push(`${mb.query}{${inner}}`);
                    } else {
                        lines.push(`${getIndent(2)}${mb.query} {`);
                        mb.rules.forEach(r => {
                            lines.push(`${getIndent(3)}${r.selector} {`);
                            r.declarations.forEach(d => {
                                lines.push(`${getIndent(4)}${d.prop}: ${d.val};`);
                            });
                            lines.push(`${getIndent(3)}}`);
                        });
                        lines.push(`${getIndent(2)}}`);
                    }
                });

                lines.push(`${getIndent(1)}</style>`);
            }

            ast.scripts.forEach(sc => {
                const attrPart = Object.keys(sc.attrs).length ? ' ' + formatAttrs(sc.attrs) : '';
                if (mode === 'none') {
                    lines.push(`<script${attrPart}>${sc.body.replace(/\s*\n\s*/g, ' ')}<` + `/script>`);
                } else {
                    lines.push(`${getIndent(1)}<script${attrPart}>`);
                    sc.body.split('\n').forEach(sl => lines.push(`${getIndent(2)}${sl.trim()}`));
                    lines.push(`${getIndent(1)}<` + `/script>`);
                }
            });

            lines.push('</' + 'head>');

            if (mode === 'none') return lines.join('');
            return lines.join('\n');
        }

        static enforceStrictClosures(html) {
            let out = html;

            const openComments = (out.match(/<!--/g) || []).length;
            const closeComments = (out.match(/-->/g) || []).length;
            if (openComments > closeComments) {
                out += ' -->'.repeat(openComments - closeComments);
            }

            out = out.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (full, cssBody) => {
                let depth = 0;
                for (let i = 0; i < cssBody.length; i++) {
                    if (cssBody[i] === '{') depth++;
                    else if (cssBody[i] === '}') depth = Math.max(0, depth - 1);
                }
                if (depth > 0) {
                    return full.replace(/<\/style>/i, '\n' + '}'.repeat(depth) + '\n</style>');
                }
                return full;
            });

            const pairedTags = ['title', 'style', 'script', 'head'];
            pairedTags.forEach(tag => {
                const openRe = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
                const closeRe = new RegExp(`</${tag}>`, 'gi');
                const opens = (out.match(openRe) || []).length;
                const closes = (out.match(closeRe) || []).length;
                if (opens > closes) {
                    const missing = opens - closes;
                    if (tag === 'head') {
                        out += '\n</' + 'head>'.repeat(missing);
                    } else if (new RegExp('</' + 'head>', 'i').test(out)) {
                        out = out.replace(new RegExp('</' + 'head>', 'i'), `</${tag}>\n</head>`);
                    } else {
                        out += `</${tag}>`;
                    }
                }
            });

            return out;
        }

        static generateFromUI() {
            const allHeads = typeof global.getLibraryHeads === 'function' ? global.getLibraryHeads() : [];
            let selectedSet = global.selectedHeadIds || new Set();

            if (selectedSet.size === 0 && allHeads.length > 0) {
                allHeads.forEach(h => selectedSet.add(h.id));
            }

            const chosen = allHeads.filter(h => selectedSet.has(h.id));

            if (chosen.length === 0) {
                if (typeof global.showToast === 'function') {
                    global.showToast('Please add or select at least 1 head in library!', 'warn');
                }
                return;
            }

            const formatMode = document.querySelector('input[name="formatMode"]:checked')?.value || 'irregular';
            const tokenMin = parseInt(document.getElementById('token-min')?.value, 10) || 100;
            const tokenMax = parseInt(document.getElementById('token-max')?.value, 10) || 200;
            const linesMin = parseInt(document.getElementById('lines-min')?.value, 10) || 50;
            const linesMax = parseInt(document.getElementById('lines-max')?.value, 10) || 100;

            const includeTitle = document.getElementById('toggle-title')?.checked ?? true;
            const includeComments = document.getElementById('toggle-comments')?.checked ?? true;
            const preferFavorites = document.getElementById('toggle-prefer-favorites')?.checked ?? true;

            const favoriteHeads = (preferFavorites && typeof global.getFavorites === 'function')
                ? global.getFavorites()
                : [];

            const res = this.synthesize(chosen, {
                formatMode,
                tokenMin,
                tokenMax,
                linesMin,
                linesMax,
                includeTitle,
                includeComments,
                favoriteHeads
            });

            if (global.lastGeneratedMeta) {
                global.lastGeneratedMeta.name = typeof global.generateRandomHeadName === 'function'
                    ? global.generateRandomHeadName()
                    : 'Synthesized Head';
                global.lastGeneratedMeta.doctype = res.doctype;
            }

            // ROBUST POLLING & INJECTION: Ensures CodeMirror is mounted before setting value
            const injectIntoEditor = (retries = 10) => {
                const editor = global.editorInstances && global.editorInstances['gen-editor'];
                if (editor && editor.cm) {
                    editor.cm.setValue(res.html);
                    editor.cm.refresh();
                    if (typeof editor.updatePreview === 'function') {
                        editor.updatePreview();
                    }
                } else if (retries > 0) {
                    setTimeout(() => injectIntoEditor(retries - 1), 50);
                }
            };
            injectIntoEditor();

            const statsEl = document.getElementById('gen-token-stats');
            const badgeEl = document.getElementById('gen-output-name-badge');

            if (statsEl) {
                const detail = formatMode === 'none'
                    ? `${res.tokenCount} tokens · compact (none)`
                    : formatMode === 'proper'
                        ? `${res.lineCount} lines · ${res.tokenCount} tokens (proper)`
                        : `${res.tokenCount} tokens · ${res.lineCount} lines (irregular)`;
                statsEl.textContent = detail;
            }

            if (badgeEl && global.lastGeneratedMeta) {
                badgeEl.textContent = global.lastGeneratedMeta.name;
            }

            if (typeof global.showToast === 'function') {
                const summary = formatMode === 'proper'
                    ? `Synthesized ${res.lineCount} lines`
                    : formatMode === 'none'
                        ? `Synthesized ${res.tokenCount} tokens`
                        : `Synthesized ${res.tokenCount} tokens · ${res.lineCount} lines`;
                global.showToast(summary);
            }
        }
    }

    global.HeadMixerEngine = HeadMixerEngine;
})(window);
