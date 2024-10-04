export function parseURL(url: string, region: string){
    return url.replace('{region}', region);
}