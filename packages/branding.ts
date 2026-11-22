export const DEFAULT_PRODUCT_LOGO='/logo-placeholder.svg';
export function normalizeLogo(value:unknown):string|null{
 if(typeof value!=='string'||!value.trim()||value===DEFAULT_PRODUCT_LOGO||/(?:^|\/)tcw-logo\.png(?:[?#].*)?$/i.test(value))return null;
 return value;
}
export function effectiveCompanyLogo(companyLogo:unknown,platformLogo:unknown){return normalizeLogo(companyLogo)||normalizeLogo(platformLogo)||DEFAULT_PRODUCT_LOGO}
