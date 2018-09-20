/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI as uri } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { guessMimeTypes, MIME_TEXT } from 'vs/base/common/mime';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITextModelService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { DEBUG_SCHEME, IDebugService, IDebugSession } from 'vs/workbench/parts/debug/common/debug';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';

/**
 * Debug URI format
 *
 * a debug URI represents a Source object and the debug session where the Source comes from.
 *
 *       debug:arbitrary_path?session=123e4567-e89b-12d3-a456-426655440000&ref=1016
 *       \___/ \____________/ \__________________________________________/ \______/
 *         |          |                             |                          |
 *      scheme   source.path                    session id            source.reference
 *
 * the arbitrary_path and the session id are encoded with 'encodeURIComponent'
 *
 */
export class DebugContentProvider implements IWorkbenchContribution, ITextModelContentProvider {

	constructor(
		@ITextModelService textModelResolverService: ITextModelService,
		@IDebugService private debugService: IDebugService,
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService
	) {
		textModelResolverService.registerTextModelContentProvider(DEBUG_SCHEME, this);
	}

	public provideTextContent(resource: uri): TPromise<ITextModel> {

		let session: IDebugSession;

		if (resource.query) {
			const data = Source.getEncodedDebugData(resource);
			session = this.debugService.getModel().getSessions().filter(p => p.getId() === data.sessionId).pop();
		}

		if (!session) {
			// fallback: use focused session
			session = this.debugService.getViewModel().focusedSession;
		}

		if (!session) {
			return TPromise.wrapError<ITextModel>(new Error(localize('unable', "Unable to resolve the resource without a debug session")));
		}
		const createErrModel = (message: string) => {
			this.debugService.sourceIsNotAvailable(resource);
			const modePromise = this.modeService.getOrCreateMode(MIME_TEXT);
			return this.modelService.createModel(message, modePromise, resource);
		};

		return session.loadSource(resource).then(response => {
			if (!response) {
				return createErrModel(localize('canNotResolveSource', "Could not resolve resource {0}, no response from debug extension.", resource.toString()));
			}

			const mime = response.body.mimeType || guessMimeTypes(resource.path)[0];
			const modePromise = this.modeService.getOrCreateMode(mime);
			return this.modelService.createModel(response.body.content, modePromise, resource);

		}, (err: DebugProtocol.ErrorResponse) => createErrModel(err.message));
	}
}
