export const DEFAULT_PRODUCT_LOGO='/tcw-logo.png';
export function effectiveCompanyLogo(companyLogo:unknown,platformLogo:unknown){return typeof companyLogo==='string'&&companyLogo&&companyLogo!==DEFAULT_PRODUCT_LOGO?companyLogo:typeof platformLogo==='string'&&platformLogo?platformLogo:DEFAULT_PRODUCT_LOGO}
