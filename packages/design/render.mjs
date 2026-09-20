/** Design compilation keeps both clients aligned without relying on WXSS variable inheritance. */
export function compileNativeStyle(source, tokens) {
    const values = {
        BRAND: tokens.brand,
        ACCENT: tokens.accent,
        BACKGROUND: tokens.background,
        SURFACE: tokens.surface,
        TEXT: tokens.text,
        MUTED: tokens.muted,
        BORDER: tokens.border,
        BODY_RPX: tokens.body * 2 + 'rpx',
        SECONDARY_RPX: tokens.secondary * 2 + 'rpx',
        CAPTION_RPX: tokens.caption * 2 + 'rpx',
        HEADING_RPX: tokens.heading * 2 + 'rpx',
        TITLE_RPX: tokens.title * 2 + 'rpx'
    };
    return source.replace(/__([A-Z_]+)__/g, (_, key) => {
        if (!(key in values))
            throw new Error('Unknown design token ' + key);
        return values[key];
    });
}

