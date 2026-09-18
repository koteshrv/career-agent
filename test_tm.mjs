import { fetchTextWithRetry, makeHttpCtx } from './sources/providers/_http.mjs';

const ASPNET_FIELD_RE = (name) => new RegExp(`id="${name}"\\s+value="(.*?)"`);

async function main() {
    const url = 'https://careers.techmahindra.com/';
    const ctx = makeHttpCtx();
    
    let getText = await fetchTextWithRetry(ctx, url, { redirect: 'error' });
    const viewstate = getText.match(ASPNET_FIELD_RE('__VIEWSTATE'))?.[1];
    const viewstategen = getText.match(ASPNET_FIELD_RE('__VIEWSTATEGENERATOR'))?.[1];
    const eventval = getText.match(ASPNET_FIELD_RE('__EVENTVALIDATION'))?.[1];
    
    console.log("Found ASP.NET tokens:", !!viewstate, !!viewstategen, !!eventval);
    
    const payload = new URLSearchParams({
        'ctl00$ContentPlaceHolder1$ScriptManager1': 'ctl00$ContentPlaceHolder1$ctl04|ctl00$ContentPlaceHolder1$btnFreeSearch',
        'ctl00$ContentPlaceHolder1$RblList': 'IT',
        'ctl00$ContentPlaceHolder1$txtAdvanceSearch': 'software',
        'ctl00$ContentPlaceHolder1$txtFirstName': '',
        'ctl00$ContentPlaceHolder1$txtLastName': '',
        'ctl00$ContentPlaceHolder1$ddlNationality': 'IND',
        'ctl00$ContentPlaceHolder1$ddlTotExpYears': 'Select Experience *',
        'ctl00$ContentPlaceHolder1$txtUserName': '',
        'ctl00$ContentPlaceHolder1$ddlType': 'Select',
        'ctl00$ContentPlaceHolder1$txtSkills': '',
        'ctl00$ContentPlaceHolder1$ddlcountrycode': 'Select country code *',
        'ctl00$ContentPlaceHolder1$txt_MobileNumber': '',
        '__EVENTTARGET': '',
        '__EVENTARGUMENT': '',
        '__LASTFOCUS': '',
        '__VIEWSTATE': viewstate,
        '__VIEWSTATEGENERATOR': viewstategen,
        '__VIEWSTATEENCRYPTED': '',
        '__EVENTVALIDATION': eventval,
        '__ASYNCPOST': 'true',
        'ctl00$ContentPlaceHolder1$btnFreeSearch': 'Search',
      });
      
    const headers = {
      'Accept': '*/*',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    };

    let postText = await fetchTextWithRetry(ctx, url, { method: 'POST', headers, body: payload.toString(), redirect: 'error' });
    console.log("POST returned length:", postText.length);
    console.log(postText.substring(0, 1000));
}
main();
    console.log("Includes '0 results':", postText.toLowerCase().includes("0 results"));
