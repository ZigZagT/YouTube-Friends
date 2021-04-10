import { youtube_v3 } from 'googleapis';
import { formatDistanceToNow } from 'date-fns';
import {
    Mjml,
    MjmlAttributes,
    MjmlBody,
    MjmlColumn,
    MjmlHead,
    MjmlImage,
    MjmlPreview,
    MjmlSection,
    MjmlStyle,
    MjmlText,
    MjmlTitle,
    MjmlWrapper,
    render,
} from 'mjml-react';
import React from 'react';

function PlaylistItemDetailsCard({
    item,
    isLastCard = true,
}: {
    item: youtube_v3.Schema$PlaylistItem;
    isLastCard: boolean;
}) {
    const videoUrl = `https://www.youtube.com/watch?v=${item.contentDetails.videoId}`;
    const { title: videoTitle, description: videoDescription } = item.snippet;
    const likedDate = new Date(item.snippet.publishedAt);

    return (
        <MjmlWrapper borderBottom={isLastCard ? undefined : 'thick double #d8d8d8'}>
            <MjmlSection>
                <MjmlColumn>
                    <MjmlText>
                        <h1>
                            <a target="_blank" rel="noopener noreferrer" href={videoUrl}>
                                {videoTitle}
                            </a>
                        </h1>
                    </MjmlText>
                    <MjmlImage
                        src={
                            Object.values(item.snippet.thumbnails).sort((t1, t2) =>
                                t2.width * t2.height > t1.width * t1.height ? 1 : -1,
                            )[0].url
                        }
                        href={videoUrl}
                        rel="noopener noreferrer"
                    />
                </MjmlColumn>
            </MjmlSection>
            <MjmlSection>
                <MjmlColumn>
                    <MjmlText>
                        <h2>Description:</h2>
                    </MjmlText>
                    <MjmlText>
                        <pre>{videoDescription}</pre>
                    </MjmlText>
                </MjmlColumn>
            </MjmlSection>
            <MjmlSection>
                <MjmlColumn>
                    <MjmlText>
                        <time>Added {formatDistanceToNow(likedDate)} ago</time>
                    </MjmlText>
                </MjmlColumn>
            </MjmlSection>
        </MjmlWrapper>
    );
}

export function buildEmail(
    title: string,
    preview: string,
    playlistItems: youtube_v3.Schema$PlaylistItem[],
): string {
    const devMode = process.env.NODE_ENV !== 'production';
    const { html, errors } = render(
        <Mjml>
            <MjmlHead>
                <MjmlTitle>{title}</MjmlTitle>
                <MjmlPreview>{preview}</MjmlPreview>
                <MjmlStyle>
                    {`
                        a,
                        a:visited {
                            color: #ec7505 !important;
                            text-decoration: underline !important;
                        }

                        h1 a {
                            color: #ec7505 !important;
                        }

                        pre {
                            white-space: pre-wrap;
                            line-height: 1.5;
                        }
                `}
                </MjmlStyle>
                <MjmlAttributes></MjmlAttributes>
            </MjmlHead>
            <MjmlBody width={700} backgroundColor="white">
                {playlistItems.map((feedItem, idx) => (
                    <PlaylistItemDetailsCard
                        item={feedItem}
                        key={idx}
                        isLastCard={idx == playlistItems.length - 1}
                    />
                ))}
            </MjmlBody>
        </Mjml>,
        {
            keepComments: devMode,
            beautify: !devMode,
            minify: !devMode,
            validationLevel: 'strict',
        },
    );
    if (errors && errors.length) {
        throw errors;
    }
    return html;
}
