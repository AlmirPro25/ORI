declare module 'webtorrent' {
  export default class WebTorrent {
    add(torrentId: string, opts: any, callback: (torrent: any) => void): void;
    destroy(): void;
  }
}
